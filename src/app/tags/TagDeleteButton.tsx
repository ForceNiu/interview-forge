"use client";

import { useActionState, useState, useEffect, useRef } from "react";
import { deleteTag } from "@/actions/tags";
import { Button } from "@/components/ui/button";

function TagDeleteButton({
  id,
  disabled,
  onDeleted,
}: {
  id: string;
  disabled?: boolean; // true = 标签正被题目引用，不允许删
  onDeleted?: () => void;
}) {
  const deleteWithId = deleteTag.bind(null, id);
  const [state, formAction, isPending] = useActionState(deleteWithId, {
    error: null,
  });
  const [confirming, setConfirming] = useState(false);

  const notified = useRef(false);
  useEffect(() => {
    if (state.ok && !notified.current) {
      notified.current = true;
      onDeleted?.();
    }
  }, [state.ok, onDeleted]);

  // 被引用中：直接显示"使用中"，不进入确认流程
  if (disabled) {
    return (
      <span className="rounded-md border border-input px-3 py-1 text-sm font-medium text-muted-foreground/60">
        使用中
      </span>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <form action={formAction}>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={isPending}
          >
            {isPending ? "删除中..." : "确认删除"}
          </Button>
        </form>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirming(false)}
        >
          取消
        </Button>
        {state.error && <span className="text-xs text-destructive">{state.error}</span>}
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={() => setConfirming(true)}
    >
      删除
    </Button>
  );
}

// React Compiler 自动 memoize，无需手动包 memo
export default TagDeleteButton;
