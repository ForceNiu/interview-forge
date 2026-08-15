"use client";
// ↑ 标了 "use client" 才能在浏览器里用 useActionState / useState / useEffect

import { useActionState, useState, useEffect, useRef, memo } from "react";
import { deleteQuestion } from "@/actions/questions";
import { Button } from "@/components/ui/button";

// onDeleted：删成功后通知父组件（列表页用来淡出+弹 toast；详情页用来跳回首页）
function DeleteButton({
  id,
  onDeleted,
}: {
  id: string;
  onDeleted?: () => void;
}) {
  // ① bind：把 id 焊进 deleteQuestion，"这个按钮只管这一道题"
  const deleteWithId = deleteQuestion.bind(null, id);

  // ② useActionState：state=服务器返回的 {error, ok}，formAction=提交触发器，isPending=进行中
  const [state, formAction, isPending] = useActionState(deleteWithId, {
    error: null,
  });

  // ③ confirming：是否处于"二次确认"状态（点删除→变确认/取消）
  const [confirming, setConfirming] = useState(false);

  // ④ 用 ref 保证 onDeleted 只在"首次成功"时调一次（避免重渲染重复触发）
  const notified = useRef(false);
  useEffect(() => {
    if (state.ok && !notified.current) {
      notified.current = true;
      onDeleted?.();
    }
  }, [state.ok, onDeleted]);

  // —— 状态 A：确认中（显示 确认删除 / 取消 两个按钮）——
  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        {/* 确认按钮：在 <form> 里、type=submit，点了才真提交 Server Action */}
        <form action={formAction}>
          <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
            {isPending ? "删除中..." : "确认删除"}
          </Button>
        </form>
        {/* 取消按钮：type=button！否则默认也会提交表单。点了回到"删除"状态 */}
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
          取消
        </Button>
        {/* 服务器返回错误时（极少数，如数据库异常）显示在旁边，可重试 */}
        {state.error && <span className="text-sm text-destructive">{state.error}</span>}
      </div>
    );
  }

  // —— 状态 B：默认（只显示"删除"按钮）——
  return (
    <Button type="button" variant="destructive" size="sm" onClick={() => setConfirming(true)}>
      删除
    </Button>
  );
}

// memo：父组件（题库列表/详情页）重渲染时，只要 id / onDeleted 没变，本按钮就跳过重渲染。
// 配合父级用 useCallback 稳定 onDeleted，翻页、淡出其他题、弹 toast 时整列不会跟着重算。
export default memo(DeleteButton);
