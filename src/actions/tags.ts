"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// 标签的 action 返回类型：和 QuestionActionState 同样的结构（error + ok）
export type TagActionState = {
  error: string | null;
  ok?: boolean;
};

// 新增标签：不引入 Zod，用简单的手写校验（只检查 name 非空 + 是否重复）
export async function createTag(
  prevState: TagActionState,
  formData: FormData
): Promise<TagActionState> {
  const name = (formData.get("name") as string)?.trim() ?? "";
  const color = (formData.get("color") as string)?.trim() ?? "#2f6b78";

  if (!name) {
    return { error: "标签名不能为空" };
  }

  try {
    await prisma.tag.create({
      data: { name, color },
    });
  } catch {
    // 最可能的失败原因：标签名重复（Tag.name 设了 @unique）
    return { error: "标签名已存在" };
  }

  // 刷新标签管理页 + 首页（题目卡片上的标签也要跟着变）
  revalidatePath("/tags");
  revalidatePath("/");
  return { error: null, ok: true };
}

// 删除标签：和 deleteQuestion 一样的结构 —— bind 预设 id，prisma.tag.delete + revalidatePath
export async function deleteTag(
  id: string,
  prevState: TagActionState
): Promise<TagActionState> {
  try {
    await prisma.tag.delete({
      where: { id },
    });
  } catch {
    return { error: "删除失败" };
  }

  // 刷新标签管理页 + 首页（题目卡片上的标签也要跟着变）
  revalidatePath("/tags");
  revalidatePath("/");
  return { error: null, ok: true };
}
