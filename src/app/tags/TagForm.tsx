"use client";

import { useActionState, useState, useEffect } from "react";
import { createTag } from "@/actions/tags";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import Toast from "@/components/Toast";

// 预设几组颜色供选择（不用让用户手输色号）—— 矿物色板
const PRESET_COLORS = [
  "#2f6b78", // 石青（默认）
  "#5a8a72", // 石绿
  "#a8744f", // 赭石
  "#d9a441", // 藤黄
  "#b5402f", // 朱砂
  "#3d4a5c", // 黛蓝
  "#7a8b6f", // 苔绿
  "#6b5b73", // 黛紫
] as const;

export default function TagForm() {
  const [state, formAction, isPending] = useActionState(createTag, {
    error: null,
  });
  const [showToast, setShowToast] = useState(false);

  // 创建成功 → 弹轻提示（不跳走，方便连续建多个标签）
  useEffect(() => {
    if (state.ok) setShowToast(true);
  }, [state.ok]);

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {/* 成功提示：用 Toast 轻提示，2.5s 自动消失 */}
      {showToast && (
        <Toast
          message="标签创建成功"
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}

      {/* 标签名输入 */}
      <div className="space-y-1.5">
        <Label htmlFor="tag-name">标签名</Label>
        <Input id="tag-name" name="name" placeholder="标签名（如：Vue、Node.js）" />
      </div>

      {/* 颜色选择 */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">选择颜色：</p>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <label key={c} className="cursor-pointer">
              <input
                type="radio"
                name="color"
                value={c}
                defaultChecked={c === "#2f6b78"}
                className="peer sr-only"
              />
              <span
                className="block h-7 w-7 rounded-full border-2 border-transparent peer-checked:border-primary peer-checked:scale-110 transition-all"
                style={{ background: c }}
              />
            </label>
          ))}
        </div>
      </div>

      {/* 提交按钮 */}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "创建中..." : "创建标签"}
      </Button>

      {/* 错误提示 */}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
