import { prisma } from "@/lib/prisma";

// 写库入参：从工作流终态抽取的关键字段
export interface RunRecordInput {
  runId: string;
  analysis: { overallLevel?: string } | null;
  strategy: { domains: { name: string }[] } | null;
  questions: { length: number };
  failedDomains: string[];
  callFailedDomains: string[];
  round: number;
  logs: unknown[];
}

// 把一次出题运行写入 GenerationRun 表（L4 可观测性）。
// 关键约束：写库失败绝不能阻塞主流程（接口该返回什么还返回什么），
// 所以内部吞掉所有异常，只打日志。这是生产级「观测不影响业务」的基本纪律。
export async function recordGenerationRun(input: RunRecordInput): Promise<void> {
  const status =
    input.failedDomains.length === 0 && input.callFailedDomains.length === 0
      ? "success"
      : "partial";

  try {
    await prisma.generationRun.create({
      data: {
        runId: input.runId,
        status,
        resumeLevel: input.analysis?.overallLevel ?? null,
        plannedDomains: input.strategy?.domains.map((d) => d.name) ?? [],
        producedCount: input.questions.length,
        failedDomains: input.failedDomains,
        callFailedCount: input.callFailedDomains.length,
        rounds: input.round,
        logs: input.logs as object,
      },
    });
  } catch (e) {
    // 写库失败（如云库临时不可达）不影响主流程；仅记录，便于排查
    console.error("[GenerationRun] 写入失败（已忽略，不影响接口返回）：", e);
  }
}
