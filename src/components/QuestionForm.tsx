"use client";
// ↑ Client Component（客户端组件）：内部用 useActionState 处理表单交互

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuestionActionState } from "@/actions/questions";
import { textOn } from "@/lib/color";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// 这个组件被「新增页」和「编辑页」共用（DRY：表单只写一次，谁用谁传参）
type QuestionFormProps = {
  action: (prevState: QuestionActionState, formData: FormData) => Promise<QuestionActionState>;
  defaultValues?: {
    title?: string;
    content?: string;
    difficulty?: number;
    tags?: { id: string }[];
  };
  availableTags?: { id: string; name: string; color: string }[];
  submitLabel: string;
  successHref: string;
  successText: string;
  cancelHref?: string;
};

const initialState: QuestionActionState = { error: null };

export default function QuestionForm({
  action,
  defaultValues,
  availableTags = [],
  submitLabel,
  successHref,
  cancelHref,
}: QuestionFormProps) {
  // useActionState 三返回值：state（提交结果）、formAction（给 form）、isPending（提交中）
  const [state, formAction, isPending] = useActionState(action, initialState);
  const router = useRouter();

  // 当前选中的标签 id 列表（客户端本地状态）。初始化为编辑时已有的标签，新增则为空。
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    defaultValues?.tags?.map((t) => t.id) ?? []
  );

  // 点标签 chip 切换选中态（已选则取消，未选则加入）
  function toggleTag(id: string) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  // 保存成功：短暂停留让用户看到"提交中→成功"，再带 toast 参数自动跳走
  const notified = useRef(false);
  useEffect(() => {
    if (state.ok && !notified.current) {
      notified.current = true;
      const sep = successHref.includes("?") ? "&" : "?";
      const url = `${successHref}${sep}toast=${encodeURIComponent("保存成功")}`;
      const t = setTimeout(() => router.push(url), 800);
      return () => clearTimeout(t);
    }
  }, [state.ok, successHref, router]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* name="title" 对应 Server Action 里 formData.get("title")；defaultValue 来自 defaultValues */}
      <div className="space-y-1.5">
        <Label htmlFor="title">题目</Label>
        <Input
          id="title"
          name="title"
          type="text"
          defaultValue={defaultValues?.title ?? ""}
          placeholder="例如：React 的 useEffect 和 useLayoutEffect 的区别"
        />
        {/* 字段级错误：Zod 按字段返回，这里精准显示在输入框下方 */}
        {state?.fieldErrors?.title && (
          <p className="text-[13px] text-destructive">{state.fieldErrors.title.join("、")}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">答案（Markdown）</Label>
        <Textarea
          id="content"
          name="content"
          rows={8}
          defaultValue={defaultValues?.content ?? ""}
          placeholder="用 Markdown 写答案&#10;&#10;## 核心区别&#10;useEffect 在浏览器绘制后异步执行..."
        />
        {state?.fieldErrors?.content && (
          <p className="text-[13px] text-destructive">{state.fieldErrors.content.join("、")}</p>
        )}
      </div>

      {/* 难度选择框：name="difficulty"，Zod 里 z.coerce.number() 把它转成数字。
          用原生 select 保证「无 JS 也能提交」，仅套用 shadcn 输入框样式 */}
      <div className="space-y-1.5">
        <Label htmlFor="difficulty">难度</Label>
        <select
          id="difficulty"
          name="difficulty"
          defaultValue={defaultValues?.difficulty?.toString() ?? "3"}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <option value="1">1 - 入门</option>
          <option value="2">2 - 简单</option>
          <option value="3">3 - 中等</option>
          <option value="4">4 - 较难</option>
          <option value="5">5 - 困难</option>
        </select>
        {state?.fieldErrors?.difficulty && (
          <p className="text-[13px] text-destructive">{state.fieldErrors.difficulty.join("、")}</p>
        )}
      </div>

      {/* 标签多选区（仅当页面层传了 availableTags 才显示） */}
      {availableTags.length > 0 && (
        <div className="space-y-1.5">
          <Label>标签（可多选）</Label>
          <div className="flex flex-wrap gap-2">
            {availableTags.map((tag) => {
              const selected = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={
                    "cursor-pointer rounded-full px-3 py-1 text-[13px] transition-colors " +
                    (selected ? "border border-transparent" : "border border-input text-foreground")
                  }
                  style={{
                    background: selected ? tag.color : "transparent",
                    color: selected ? textOn(tag.color) : undefined,
                  }}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
          {/* 把选中的标签作为隐藏字段提交：每个 id 一个 name="tagIds"，
              后端 formData.getAll("tagIds") 即拿到整串选中 id 数组 */}
          {selectedTagIds.map((id) => (
            <input key={id} type="hidden" name="tagIds" value={id} />
          ))}
        </div>
      )}

      {/* 提交 + 取消：取消回到对应页（新增→首页，编辑→详情） */}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "提交中..." : submitLabel}
        </Button>
        {cancelHref && (
          <Button asChild variant="ghost">
            <Link href={cancelHref}>取消</Link>
          </Button>
        )}
      </div>

      {/* 非字段级错误（如数据库写入失败） */}
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
