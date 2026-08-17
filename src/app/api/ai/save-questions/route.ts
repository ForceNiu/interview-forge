import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

interface QuestionInput {
  title: string;
  content: string;
  difficulty: number;
  tags: string[];
}

// ③ 档去重：跨运行精确查重（落库前比对该用户已有题目标题，命中即跳过）。
// 归一化（去空白/标点/大小写）后比较，避免 "XX？" 与 "XX" 被判为不同。
function normalizeTitle(t: string): string {
  return (t || "").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
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

    // ③ 档去重：加载该用户已有题目标题（归一化），落库前比对，命中即跳过重复题。
    const existingTitles = new Set(
      (await prisma.question.findMany({ where: { userId: user.id }, select: { title: true } }))
        .map((r) => normalizeTitle(r.title))
    );

    let savedCount = 0;
    let skippedCount = 0;

    for (const q of questions) {
      // ③ 跨运行查重：同用户已有同名（归一化后）题目 → 跳过，避免重复入库
      const normTitle = normalizeTitle(q.title);
      if (normTitle && existingTitles.has(normTitle)) {
        skippedCount++;
        continue;
      }
      existingTitles.add(normTitle); // 同一批内也防重

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

    return Response.json({ ok: true, savedCount, skippedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
