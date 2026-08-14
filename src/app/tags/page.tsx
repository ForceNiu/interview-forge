import { prisma } from "@/lib/prisma";
import TagForm from "./TagForm";
import TagList from "./TagList";

export default async function TagsPage() {
  // Server Component 查所有标签
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { questions: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">标签管理</h1>

      {/* 新建标签表单 */}
      <TagForm />

      {/* 标签列表（客户端组件，删成功会弹轻提示） */}
      <div className="mt-8">
        <TagList tags={tags} />
      </div>
    </main>
  );
}
