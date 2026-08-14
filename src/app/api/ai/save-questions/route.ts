import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

interface QuestionInput {
  title: string;
  content: string;
  difficulty: number;
  tags: string[];
}

/**
 * POST /api/ai/save-questions
 *
 * 保存 AI 生成的题目到题库。
 * 处理逻辑：
 *   1) 逐题入库，标记 isAiGenerated = true
 *   2) 标签复用：同名 Tag 已存在则复用，不存在则新建
 *   3) 通过 QuestionTag 关联表建立多对多关系
 */
export async function POST(request: Request) {
  try {
    const { questions } = (await request.json()) as { questions: QuestionInput[] };

    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      return Response.json({ error: "没有可保存的题目" }, { status: 400 });
    }

    // 取当前用户（单用户：取第一条），供循环内所有题目共用归属
    const user = await prisma.user.findFirst();
    if (!user) {
      return Response.json({ error: "用户不存在，无法保存" }, { status: 500 });
    }

    let savedCount = 0;

    for (const q of questions) {
      // ① 处理标签：查重复用
      const tagRecords = await Promise.all(
        q.tags.map(async (tagName) => {
          const existing = await prisma.tag.findUnique({ where: { name: tagName } });
          if (existing) return existing;

          return prisma.tag.create({
            data: { name: tagName, color: "#a8744f" },
          });
        })
      );

      // ② 创建题目 + 关联标签（嵌套写入 QuestionTag）
      await prisma.question.create({
        data: {
          title: q.title,
          content: q.content,
          difficulty: Math.min(5, Math.max(1, q.difficulty || 3)),
          source: "ai",
          isAiGenerated: true,
          userId: user.id,
          tags: {
            create: tagRecords.map((tag) => ({
              tagId: tag.id,
            })),
          },
        },
      });

      savedCount++;
    }

    // 刷新首页缓存
    revalidatePath("/");

    return Response.json({ ok: true, savedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
