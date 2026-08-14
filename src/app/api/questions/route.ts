import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 题目列表接口（支持分页，修复 C-21：原实现无 take/skip，题量上千会拖垮首屏与接口）
// GET /api/questions                → 返回题目（默认分页：limit=50, offset=0）
// GET /api/questions?favorite=true → 只返回收藏的题目（供 /favorites 页用）
// GET /api/questions?limit=10&offset=20 → 取第 3 页，每页 10 条（offset 分页 / limit-offset）
// 返回结构：{ items: 题目[]; total: 符合条件总数; limit; offset }
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const favorite = searchParams.get("favorite");

  // 解析分页参数：容错非法输入，limit 夹在 [1,100]、offset 不小于 0
  const rawLimit = parseInt(searchParams.get("limit") ?? "50", 10);
  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 100);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  // favorite=true 时才加过滤条件；其它情况（含无参数）返回全部
  const where = favorite === "true" ? { favorite: true } : {};

  // 一次请求里并行跑「本页数据」+「总数」：findMany 用 take/skip 取窗口，
  // count 拿到总数供前端算页数。两者共享同一 where，保证「本页」和「总数」口径一致。
  const [items, total] = await Promise.all([
    prisma.question.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        difficulty: true,
        source: true,
        favorite: true,
        updatedAt: true,
        // 收藏卡片要显示标签 chip，连表把 tag 一起带出来
        tags: { include: { tag: true } },
      },
    }),
    prisma.question.count({ where }),
  ]);

  return NextResponse.json({ items, total, limit, offset });
}
