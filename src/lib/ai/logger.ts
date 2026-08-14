// 统一日志入口（Day 14）
// 一处写两处：
//   L1 服务端终端实时打印（console.log）
//   L2 累积进 logs 数组，随 workflow state 流转，最终可在接口返回里看到

export interface LogLine {
  ts: string; // ISO 时间戳
  msg: string; // 日志内容
}

// 生成本次运行唯一 ID，用于把同一次出题的所有日志串起来
export function makeRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// 追加一条日志：打印到终端，并返回新的数组（不可变更新，便于随 state 传递）
export function appendLog(runId: string, logs: LogLine[], msg: string): LogLine[] {
  const line: LogLine = { ts: new Date().toISOString(), msg };
  // L1：服务端终端实时输出
  console.log(`[AI-WF ${runId}] ${msg}`);
  return [...logs, line];
}
