import QuestionForm from "@/components/QuestionForm";
import { createQuestion } from "@/actions/questions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";

// 本文件是 Server Component（服务端组件）：只负责「页面布局 + 把 createQuestion 作为 prop 传给 QuestionForm」。
// 表单交互全部在 QuestionForm（客户端组件）内部，server→client 传 Server Action 是 Next.js 支持的模式。
export default async function NewQuestionPage() {
  // TG-2：在服务器查全量标签，直接当 prop 传给表单（客户端组件不能直连数据库）
  const allTags = await prisma.tag.findMany();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">新增题目</h1>

      {/* 复用 QuestionForm：传 createQuestion + 成功跳首页 */}
      <Card className="p-6">
        <QuestionForm
          action={createQuestion}
          availableTags={allTags}
          submitLabel="新增题目"
          successHref="/"
          successText="返回首页"
          cancelHref="/"
        />
      </Card>
    </main>
  );
}
