// 把工作流/API 抛出的原始异常翻译成用户能看懂的中文提示（B-14）。
// 清掉 debug 后门后，正常失败也必须走这里，绝不能把 LangGraph/LLM 的原始异常裸露给前端。
//
// kind：错误大类，前端据此做「视觉分化」——同一红横幅但图标/强调不同，
// 让用户一眼区分「是 Key 问题 / 超时 / 限流 / 上游抖动 / 格式 / 未知」。

export type ErrorKind = "key" | "rate" | "timeout" | "server" | "schema" | "unknown";

// 前端横幅用的图标（与项目进度区 ✅/⏳/⬜/❌ 同族 emoji 风格）
export const ERROR_KIND_ICON: Record<ErrorKind, string> = {
  key: "🔑",
  rate: "🚦",
  timeout: "⏱️",
  server: "🔌",
  schema: "📋",
  unknown: "⚠️",
};

export function toUserMessage(err: unknown): { title: string; detail: string; kind: ErrorKind } {
  const msg = err instanceof Error ? err.message : String(err);

  if (/401|403|Authentication|invalid api key|Incorrect API key|未授权/i.test(msg))
    return { title: "密钥无效或权限不足", detail: "请检查 DeepSeek API Key 是否正确、是否仍有效。", kind: "key" };
  if (/429|rate limit|频率/i.test(msg))
    return { title: "调用频率过高", detail: "账号级限流，请稍后重试（一般 1 分钟内可恢复）。", kind: "rate" };
  if (/timeout|timed?out|ETIMEDOUT|abort/i.test(msg))
    return { title: "响应超时", detail: "模型响应过慢，请重试。若多次超时可缩短简历 / JD。", kind: "timeout" };
  if (/5\d\d|Bad Gateway|Service Unavailable|ECONN|network|网络/i.test(msg))
    return { title: "服务端暂时异常", detail: "上游模型服务抖动，请稍后重试。", kind: "server" };
  if (/Zod|schema|格式不合规|校验|validate/i.test(msg))
    return { title: "部分题目格式不合规", detail: "已自动跳过不合格题目，可重出这些域。", kind: "schema" };

  return { title: "生成失败", detail: "发生未知错误，可重试；若反复失败请看网络或 Key。", kind: "unknown" };
}
