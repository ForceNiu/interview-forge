import { prisma } from "@/lib/prisma";
import SearchableQuestions from "./SearchableQuestions";

export default async function Home({
  searchParams,
}: {
  // Next 16：searchParams 是 Promise，需 await 后取值
  searchParams: Promise<{ tag?: string }>;
}) {
  // 仍由 Server Component 负责查库（只有服务端能碰 prisma，凭证不暴露给浏览器）
  const questions = await prisma.question.findMany({
    include: {
      tags: {
        include: { tag: true },
      },
    },
    // 按创建时间倒序：新加的题排最前，用户提交后能立刻看到，避免"以为没保存"
    orderBy: { createdAt: "desc" },
  });
  // 从 URL 的 ?tag=xxx 读出当前要过滤的标签（标签 chip 点击后跳回首页并带此参数）
  const { tag } = await searchParams;
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      {/* 把查到的数据当 props 传给 Client Component，由它在浏览器里渲染（搜索 + 实时计数 + 标签过滤） */}
      <SearchableQuestions questions={questions} activeTag={tag} />
    </main>
  );
}
