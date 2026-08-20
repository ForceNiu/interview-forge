"use client";
// 答案正文渲染组件：把数据库里存的 Markdown 字符串渲染成带层级/列表/代码块的富文本。
// 用「客户端组件」包一层 react-markdown，避免 RSC 边界问题；详情页（Server Component）
// 只把 content 字符串当 prop 传进来即可。
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ① remarkGfm 插件数组提升到模块作用域：避免每次渲染都新建数组。
const REMARK_PLUGINS = [remarkGfm];

// React Compiler 自动 memoize，content 不变时跳过重渲染
function MarkdownView({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{content}</ReactMarkdown>
    </div>
  );
}

export default MarkdownView;
