import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import DetailActions from './DetailActions'
import FavoriteButton from '@/components/FavoriteButton'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import MarkdownView from '@/components/MarkdownView'
import { difficultyLabel, difficultyColor } from '@/lib/difficulty'
import { textOn } from '@/lib/color'

export default async function QuestionDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const question = await prisma.question.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
    },
  })

  if (!question) {
    return (
      <main className="max-w-md mx-auto px-8 py-16">
        <Card>
          <CardHeader className="text-center">
            <CardTitle>题目不存在</CardTitle>
            <CardDescription>你访问的这道题找不到了（id = {id}）。</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild>
              <Link href="/">← 返回题库</Link>
            </Button>
          </CardFooter>
        </Card>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      {/* 返回入口：详情页原本是孤岛，加 ← 回题库，避免用户迷路 */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        ← 返回题库
      </Link>
      <Card className="space-y-4 p-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{question.title}</h1>

        {/* 渲染关联标签：背景色来自数据库(qt.tag.color)是运行时才知道的 → 必须留 inline style */}
        <div className="flex flex-wrap gap-2">
          {question.tags.map((qt) => (
            <span
              key={qt.tagId}
              className="rounded-xl px-2.5 py-0.5 text-[13px]"
              style={{ background: qt.tag.color, color: textOn(qt.tag.color) }}
            >
              {qt.tag.name}
            </span>
          ))}
        </div>

        <p className="text-sm text-muted-foreground">
          难度：
          <span style={{ color: difficultyColor(question.difficulty) }}>
            {difficultyLabel(question.difficulty)}（{question.difficulty}）
          </span>
        </p>
        {/* 答案正文：Markdown 渲染（标题/列表/代码块），不再当纯文本 */}
        <MarkdownView content={question.content} />

        {/* 操作按钮区：编辑 + 删除 + 收藏 */}
        <DetailActions id={id} />
        <div className="mt-3">
          <FavoriteButton id={id} initialFavorite={question.favorite} />
        </div>
      </Card>
    </main>
  )
}
