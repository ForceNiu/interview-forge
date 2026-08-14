import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 切换题目的收藏状态（toggle 取反）
// PATCH /api/questions/[id]/favorite
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const current = await prisma.question.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "题目不存在" }, { status: 404 });
  }

  const updated = await prisma.question.update({
    where: { id },
    data: { favorite: !current.favorite },
  });

  return NextResponse.json(updated);
}
