"use client";
// 答案正文渲染组件：把数据库里存的 Markdown 字符串渲染成带层级/列表/代码块的富文本。
// 用「客户端组件」包一层 react-markdown，避免 RSC 边界问题；详情页（Server Component）
// 只把 content 字符串当 prop 传进来即可。
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ① remarkGfm 插件数组提升到模块作用域：避免每次渲染都新建数组（否则旧数组会被 React 当作 prop 变化，
// 即便组件被 memo 也会因此重渲染）。
const REMARK_PLUGINS = [remarkGfm];

// ① memo：content 不变时跳过重渲染（例如详情页其他部分触发重渲染时，Markdown 子树稳定不动）。
const MarkdownView = memo(function MarkdownView({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
    </div>
  );
});

export default MarkdownView;
