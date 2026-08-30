import { buildWorkflow, WorkflowState } from "@/lib/ai/workflow";
import { makeRunId } from "@/lib/ai/logger";
import { recordGenerationRun } from "@/lib/ai/recordRun";
import { toUserMessage } from "@/lib/ai/errorMessage";

/**
 * POST /api/ai/generate
 *
 * SSE 流式输出：每完成一个 LangGraph 节点，推送一条进度事件给前端。
 *
 * 事件格式（SSE 标准）：
 *   data: {"phase":"analyzeResume","status":"running"}
 *   data: {"phase":"analyzeResume","status":"done","summary":"已识别 Vue/Electron 等技能"}
 *   ...
 *   data: {"phase":"done","questions":[...],"analysis":{...}}
 *
 * Body: { resume: string, jd?: string }
 */
export async function POST(request: Request) {
  const { resume, jd, forcePartial } = await request.json();
  // 捕获客户端取消信号：浏览器 abort fetch 时 request.signal 触发，用于真正中断服务端 LLM 调用
  const signal = request.signal;

  if (!resume || typeof resume !== "string" || resume.trim().length === 0) {
    return Response.json({ error: "请提供简历内容" }, { status: 400 });
  }

  // 创建 SSE 响应流
  const stream = new ReadableStream({
    async start(controller) {
      // SSE 工具函数：推送一条事件（已取消则不再推送，避免向已断开的 socket enqueue 抛错）
      const push = (data: Record<string, unknown>) => {
        if (signal.aborted) return;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // emitted 提到 try 外：catch 需要它推断「失败节点」（第一个未完成的阶段）
      const emitted = new Set<string>();

      try {
        const graph = buildWorkflow();

        // LangGraph 的 .stream() 方法：每执行完一个节点就 yield 一次状态快照
        // configurable.emit 把 SSE 推送函数注入每个节点（节点内可透传更细粒度的「域级进度」事件）
        const streamResult = await graph.stream(
          {
            resume: resume.trim(),
            jd: jd?.trim() ?? "",
            analysis: null,
            strategy: null,
            questions: [],
            failedDomains: [],
            logs: [],
            runId: makeRunId(),
            generationDone: false,
            round: 0,
            refineDomains: [],
            routing: null,
          },
          { streamMode: "values", configurable: { emit: push, signal, forcePartial: !!forcePartial } } // "values" 模式：每个节点完成后 emit 完整状态；signal/forcePartial 透传给各节点
        );

        // 遍历流式结果
        let hadRefine = false;
        let lastChunk: typeof WorkflowState.State | null = null;
        for await (const chunk of streamResult) {
          lastChunk = chunk;
          // 用 emitted 集合防止重复推送；用 generationDone 精确判定节点④是否真的跑完
          // （避免"题目为 0"时无法区分"还没跑"还是"跑了但没产出"）
          // 精炼环事件：⑤ 校验后若需重出，按 round 推送一次（避免重出时重复刷屏）
          if (
            (chunk.round ?? 0) > 0 &&
            (chunk.refineDomains?.length ?? 0) > 0 &&
            !emitted.has(`refine-${chunk.round}`)
          ) {
            emitted.add(`refine-${chunk.round}`);
            hadRefine = true;
            push({
              phase: "refine",
              status: "running",
              round: chunk.round,
              summary: `第 ${chunk.round} 轮精炼：重出 ${chunk.refineDomains.join("、")} 域`,
            });
          } else if (chunk.analysis && !emitted.has("analyzeResume")) {
            emitted.add("analyzeResume");
            push({
              phase: "analyzeResume",
              status: "done",
              summary: `识别技能：${chunk.analysis.skills.length}项 | 水平：${chunk.analysis.overallLevel}`,
              analysis: chunk.analysis,
            });
          } else if (chunk.routing && !emitted.has("routeCandidate")) {
            emitted.add("routeCandidate");
            push({
              phase: "routeCandidate",
              status: "done",
              summary: `路由分流：水平=${chunk.routing.level} 角色=${chunk.routing.targetRole}`,
              routing: chunk.routing,
            });
          } else if (chunk.strategy && !emitted.has("planStrategy")) {
            emitted.add("planStrategy");
            push({
              phase: "planStrategy",
              status: "done",
              summary: `规划出题策略：${chunk.strategy.domains.length}个知识域`,
              strategy: chunk.strategy,
            });
          } else if (chunk.generationDone && !emitted.has("generateQuestions")) {
            emitted.add("generateQuestions");
            const failed = chunk.failedDomains ?? [];
            const partial = failed.length > 0;
            push({
              phase: "generateQuestions",
              status: partial ? "partial" : "done",
              summary: `生成${chunk.questions.length}道题目${partial ? `，${failed.length}个知识域失败` : ""}`,
              questions: chunk.questions,
              failedDomains: failed,
            });
          }
        }

        // 全部完成：带最终 failedDomains / questions 收尾，确保重出修好的域不再误显示
        const finalFailed = lastChunk?.failedDomains ?? [];
        const finalQuestions = lastChunk?.questions ?? [];
        if (hadRefine) {
          push({ phase: "refine", status: "done", summary: "精炼完成", failedDomains: finalFailed });
        }
        push({ phase: "done", failedDomains: finalFailed, questions: finalQuestions });

        // L4 可观测性：流式结束后写一行（写库失败不影响已推送的 done 事件）
        if (lastChunk) {
          await recordGenerationRun({
            runId: lastChunk.runId,
            analysis: lastChunk.analysis,
            strategy: lastChunk.strategy,
            questions: lastChunk.questions ?? [],
            failedDomains: lastChunk.failedDomains ?? [],
            callFailedDomains: lastChunk.callFailedDomains ?? [],
            round: lastChunk.round ?? 0,
            logs: lastChunk.logs ?? [],
          });
        }
      } catch (error) {
        // 用户主动取消：request.signal 已 abort，直接关闭流、不推送错误事件、不消耗额外资源
        if (signal.aborted) {
          controller.close();
          return;
        }
        // 推断失败节点：emitted 记录了「已完成」的阶段，第一个未完成的即失败所在。
        // 顺序与图节点一致：分析简历 → 路由分流 → 规划策略 → 生成题目 → 校验题目。
        const phaseOrder = [
          "analyzeResume",
          "routeCandidate",
          "planStrategy",
          "generateQuestions",
          "validateQuestions",
        ];
        const failingPhase = phaseOrder.find((p) => !emitted.has(p)) ?? "unknown";
        const { title, detail, kind } = toUserMessage(error);
        push({ phase: "error", error: title, detail, kind, errorPhase: failingPhase });
      } finally {
        // 已取消分支可能已 close，重复 close 在 web stream 里会抛错，做安全包裹
        try { controller.close(); } catch {}
      }
    },
  });

  // SSE 标准响应头
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
