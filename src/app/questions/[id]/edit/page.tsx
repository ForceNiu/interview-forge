// 编辑题目页：Server Component（服务端组件）
import { prisma } from "@/lib/prisma";
import { updateQuestion } from "@/actions/questions";
import QuestionForm from "@/components/QuestionForm";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const question = await prisma.question.findUnique({
    where: { id },
    include: { tags: { include: { tag: true } } },
  });

  // id 不存在或题目已被删：给个提示，不崩
  if (!question) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
        <p className="text-destructive">题目不存在或已被删除。</p>
        <Button asChild variant="link" className="h-auto p-0">
          <Link href="/">返回首页</Link>
        </Button>
      </main>
    );
  }

  // 用 bind 把 id 喂进 updateQuestion，匹配 QuestionForm 要求的 action 形状
  const action = updateQuestion.bind(null, id);

  const allTags = await prisma.tag.findMany();
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">编辑题目</h1>
      <Card className="p-6">
        <QuestionForm
          action={action}
          availableTags={allTags}
          defaultValues={{
            title: question.title,
            content: question.content,
            difficulty: question.difficulty,
            tags: question.tags.map((qt) => ({ id: qt.tagId })),
          }}
          submitLabel="保存修改"
          successHref={`/questions/${id}`}
          successText="返回题目详情"
          cancelHref={`/questions/${id}`}
        />
      </Card>
    </main>
  );
}
