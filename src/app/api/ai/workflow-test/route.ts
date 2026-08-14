import { buildWorkflow } from "@/lib/ai/workflow";
import { makeRunId } from "@/lib/ai/logger";
import { recordGenerationRun } from "@/lib/ai/recordRun";

/**
 * POST /api/ai/workflow-test
 * 跑完整四节点工作流图，验证全链路
 *
 * Body: { resume: string, jd?: string }
 */
export async function POST(request: Request) {
  try {
    const { resume, jd } = await request.json();

    if (!resume || typeof resume !== "string" || resume.trim().length === 0) {
      return Response.json({ error: "请提供简历内容" }, { status: 400 });
    }

    const graph = buildWorkflow();
    const result = await graph.invoke({
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
    });

    // L4 可观测性：把本次运行写入 GenerationRun 表（失败不阻塞主流程）
    await recordGenerationRun({
      runId: result.runId,
      analysis: result.analysis,
      strategy: result.strategy,
      questions: result.questions,
      failedDomains: result.failedDomains,
      callFailedDomains: result.callFailedDomains,
      round: result.round,
      logs: result.logs,
    });

    return Response.json({
      ok: true,
      runId: result.runId,
      analysis: result.analysis,
      routing: result.routing,
      strategy: result.strategy,
      questions: result.questions,
      failedDomains: result.failedDomains,
      round: result.round,
      callFailedDomains: result.callFailedDomains,
      logs: result.logs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return Response.json({ error: message }, { status: 500 });
  }
}
