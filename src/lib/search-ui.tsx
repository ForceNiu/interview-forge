import type { ReactNode } from "react";

// 搜索结果展示辅助：把「正文命中」从「看不出」变成「看得见」。
// 配合 SearchableQuestions：搜索时卡片显示正文摘要并高亮命中词。

/** 去掉 markdown 标记，得到纯文本（用于摘要与高亮，避免把 # / * / 代码块渲染出来） */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // 代码块
    .replace(/`([^`]+)`/g, "$1") // 行内代码
    .replace(/^#{1,6}\s+/gm, "") // 标题 #
    .replace(/^\s*>\s?/gm, "") // 引用 >
    .replace(/[*_~]/g, "") // 强调符号
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接 / 图片
    .replace(/\n+/g, " ") // 换行压成空格
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 从正文里截取一段摘要：
 * - 若 query 命中，截取命中处前后（命中前留 40 字上下文），首尾用 … 表示截断
 * - 若未命中（理论上不会出现，因为搜索已保证命中），取开头 len 字
 */
export function getSnippet(content: string, query: string, len = 140): string {
  const plain = stripMarkdown(content);
  const q = query.trim().toLowerCase();
  if (!q) return plain.slice(0, len);
  const idx = plain.toLowerCase().indexOf(q);
  if (idx === -1) return plain.slice(0, len);
  const start = Math.max(0, idx - 40);
  const end = Math.min(plain.length, start + len);
  return (start > 0 ? "…" : "") + plain.slice(start, end) + (end < plain.length ? "…" : "");
}

/**
 * 全局高亮 query 在 text 中的出现（大小写不敏感，与搜索行为一致）。
 * 返回 React 节点数组，命中处用 <mark> 包裹；无命中返回原文本。
 * 用 indexOf 而非正则，避免 query 含正则特殊字符时出错。
 */
export function highlight(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (true) {
    const idx = lowerText.indexOf(lowerQ, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={key++} className="rounded bg-yellow-300 px-0.5 text-black">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    i = idx + q.length;
  }
  return <>{parts}</>;
}
