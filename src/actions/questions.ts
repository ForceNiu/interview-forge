"use server";
// ↑ 文件级声明：这个文件里所有 export 函数都是 Server Action
//   客户端调用时，Next.js 自动生成 POST 端点、自动序列化参数/返回值

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import {
  questionSchema,
  formatZodError,
  type FieldErrors,
} from "@/lib/validator";

// Server Action 的返回值类型：客户端通过 state 拿到这个对象
export type QuestionActionState = {
  error: string | null; // 非字段级错误（如数据库写入失败）
  fieldErrors?: FieldErrors; // 字段级错误（来自 Zod，按字段分组）
  ok?: boolean; // 新增/更新成功的标记
};

export async function createQuestion(
  // 第一个参数是上一次的 state（useActionState 自动传）
  prevState: QuestionActionState,
  // 第二个参数是 formData（<form action={formAction}> 自动收集）
  formData: FormData
): Promise<QuestionActionState> {
  // 1) 先把表单值收成普通对象（难度是字符串，交给 z.coerce 转数字）
  const raw = {
    title: (formData.get("title") as string) ?? "",
    content: (formData.get("content") as string) ?? "",
    difficulty: (formData.get("difficulty") as string) ?? "3",
    // TG-2：收集表单里所有 name="tagIds" 的隐藏 input（即用户勾选的标签 id）
    // getAll 返回原生的 string[]，正好对上 questionSchema 里的 z.array(z.string())
    tagIds: formData.getAll("tagIds") as string[],
  };

  // 2) Zod 校验：失败就返回字段级错误，前端按字段标红
  const result = questionSchema.safeParse(raw);
  if (!result.success) {
    return { error: null, fieldErrors: formatZodError(result.error) };
  }

  // 3) 校验通过：result.data 是「已修剪 + 已转类型」的干净数据
  try {
    // 单用户个人工具：取库中现有用户作为题目归属。
    // 原来硬编码 "default-user" 在库里不存在，会触发外键约束错误（P2003）→ 写入失败。
    // 改为运行时取唯一用户，避免写库崩溃；将来接入 Auth 时替换此处。
    let owner = await prisma.user.findFirst();
    if (!owner) {
      owner = await prisma.user.create({ data: { email: "demo@local.dev", name: "我" } });
    }
    await prisma.question.create({
      data: {
        title: result.data.title,
        content: result.data.content,
        difficulty: result.data.difficulty, // 已是 number
        source: "",
        isAiGenerated: false,
        userId: owner.id,
        // TG-2：通过显式中间表 QuestionTag 关联标签。
        // 中间表 QuestionTag 无独立 id 字段（复合主键 questionId+tagId），
        // 所以不能用 connect:{id}，而要用 create 给每条记录填 tagId（questionId 由 Prisma 自动填）。
        // 即使没选任何标签，create:[] 也是合法写法（不建任何关联）。
        tags: {
          create: result.data.tagIds.map((id) => ({ tagId: id })),
        },
      },
    });
  } catch {
    return { error: "数据库写入失败" };
  }

  // 告诉 Next.js：首页数据过期了，下次访问重新查库
  revalidatePath("/");

  // 成功标记，客户端用 state.ok 判断是否显示「新增成功」
  return { error: null, ok: true };
}

// 更新题目：和 createQuestion 共用同一套 Zod 校验（questionSchema），
// 区别只是多一个 id 定位 + 用 prisma.update 而不是 create
// 注意第一个参数 id 由编辑页用 .bind(null, id) 预设，所以签名是 (id, prevState, formData)
export async function updateQuestion(
  id: string,
  prevState: QuestionActionState,
  formData: FormData
): Promise<QuestionActionState> {
  // 收集表单值（和 createQuestion 一模一样）
  const raw = {
    title: (formData.get("title") as string) ?? "",
    content: (formData.get("content") as string) ?? "",
    difficulty: (formData.get("difficulty") as string) ?? "3",
    // TG-2：和 createQuestion 同样收集勾选的标签 id
    tagIds: formData.getAll("tagIds") as string[],
  };

  // 复用同一个 questionSchema：校验失败返回字段级错误（和新增完全一致）
  const result = questionSchema.safeParse(raw);
  if (!result.success) {
    return { error: null, fieldErrors: formatZodError(result.error) };
  }

  // 校验通过：按 id 定位、写回库
  try {
    await prisma.question.update({
      where: { id },
      data: {
        title: result.data.title,
        content: result.data.content,
        difficulty: result.data.difficulty,
        // TG-2：编辑用「先断开旧关联、再按当前选择重建」实现标签整体替换。
        // 显式中间表不支持 set:{id}，故用 deleteMany 清空这道题旧的所有标签关联
        // + create 重建当前勾选；空数组时 = 仅 deleteMany（清空所有标签）。
        tags: {
          deleteMany: {},
          create: result.data.tagIds.map((id) => ({ tagId: id })),
        },
      },
    });
  } catch {
    return { error: "数据库更新失败" };
  }

  // 两处路径过期：首页（列表）和当前详情页都要刷新
  revalidatePath("/");
  revalidatePath(`/questions/${id}`);

  return { error: null, ok: true };
}

// 删除题目：和 create/update 同族，都是 Server Action
// 区别：不用 Zod（没有表单字段要校验），只需要 prisma.question.delete + try/catch + revalidatePath
// 签名和 updateQuestion 一样：(id, prevState) —— id 由 DeleteButton 用 .bind(null, id) 预设
export async function deleteQuestion(
  id: string,
  _prevState: { error: string | null; ok?: boolean }
): Promise<{ error: string | null; ok?: boolean }> {
  try {
    await prisma.question.delete({
      where: { id },
    });
  } catch {
    return { error: "删除失败" };
  }

  // 列表页缓存过期：下次访问首页重新查库（被删的那条就没了）
  revalidatePath("/");

  return { error: null, ok: true };
}

// ① 连库搜索：把"搜索"从前端 .filter 移到后端 Server Action（Prisma 连库模糊查）
// 为什么移到后端：浏览器里跑不了 prisma（DB 凭证不能暴露给客户端）；小数据量下也能
// 借"后端查询"天然规避凭证暴露与数据全量下发。客户端只负责 300ms 防抖后调用本函数。
// 搜索范围：标题 + 正文 + 标签名（比原前端只匹配标题更全）；mode:'insensitive' 做大小写不敏感，
// 在 PostgreSQL 上由 ILIKE/CI collation 支撑，无需 citext 扩展。
export async function searchQuestions(
  query: string
): Promise<
  Prisma.QuestionGetPayload<{
    include: { tags: { include: { tag: true } } };
  }>[]
> {
  const q = query.trim();
  if (!q) return [];

  return prisma.question.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
        // ① 标签名也纳入搜索：搜标签名（如「网络」）能命中打过该标签的题，避免"数据存在却搜不到"
        { tags: { some: { tag: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    },
    include: { tags: { include: { tag: true } } },
    orderBy: { updatedAt: "desc" },
  });
}
