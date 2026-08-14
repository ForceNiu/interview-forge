/**
 * 开放重定向（open redirect）防护
 *
 * 把 proxy / unlock 流程里的 ?from= 参数解析成安全的站内跳转目标，
 * 防止攻击者构造 `?from=//evil.com` 或 `?from=https://evil.com` 把用户带出站外。
 *
 * 规则：
 *   - 空值 → 回首页 /
 *   - 先 decodeURIComponent（兜底：即使客户端漏解码 %2F 也能还原成 /）
 *   - 仅允许站内绝对路径（以 / 开头，且不能是 // 协议相对）
 *   - 其余一律回首页 /
 */
export function sanitizeFrom(from?: string): string {
  if (!from) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(from);
  } catch {
    return "/";
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/";
  return decoded;
}
