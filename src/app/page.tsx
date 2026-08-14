import { prisma } from "@/lib/prisma";
import SearchableQuestions from "./SearchableQuestions";

export default async function Home() {
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
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      {/* 把查到的数据当 props 传给 Client Component，由它在浏览器里渲染（搜索 + 实时计数） */}
      <SearchableQuestions questions={questions} />
    </main>
  );
}
