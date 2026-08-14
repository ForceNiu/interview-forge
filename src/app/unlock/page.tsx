"use client";

/**
 * 站点解锁页（/unlock）
 *
 * 这是用户访问受保护站点时看到的唯一页面。
 * 由 middleware.ts 重定向过来——用户未通过密码验证时都会落在这里。
 *
 * 设计意图：
 *   - 极简：只有一个密码框 + 一个按钮，不显示 NavBar/任何站内导航
 *     （因为用户还没通过验证，不该看到站内内容）
 *   - 居中卡片，适配项目奶油赤陶风（cream 背景 + terracotta 主色）
 *   - 输错有明确提示，输对自动跳回原页面
 *
 * 为什么是 "use client"：
 *   需要 useState 管理密码输入、useActionState 接 Server Action 的结果。
 *   密码值本身不会发到客户端 JS 之外——它直接传给 Server Action，
 *   在服务端与 SITE_PASSWORD 比对，原文不出浏览器内存。
 */

import { useActionState } from "react";
import { unlockSite } from "@/actions/unlock";
import { Button } from "@/components/ui/button";

export default function UnlockPage() {
  const [state, formAction, isPending] = useActionState(
    async (_prevState: unknown, formData: FormData) => {
      const password = formData.get("password") as string;
      const from = formData.get("from") as string | undefined;
      return unlockSite(password, from);
    },
    null
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBF7F0] px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-border bg-card p-8 shadow-sm">
        {/* 标题区 */}
        <div className="space-y-2 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            访问受限
          </h1>
          <p className="text-sm text-muted-foreground">
            请输入访问密码以继续
          </p>
        </div>

        {/* 密码表单 */}
        <form action={formAction} className="space-y-4">
          {/* 隐藏字段：记住用户原本想去的路径 */}
          <input
            type="hidden"
            name="from"
            defaultValue={
              typeof window !== "undefined"
                ? window.location.search.slice(1).split("&").find((p) => p.startsWith("from="))?.split("=")[1] || "/"
                : "/"
            }
          />

          {/* 密码输入框 */}
          <div className="space-y-2">
            <label
              htmlFor="site-password"
              className="block text-sm font-medium text-foreground"
            >
              访问密码
            </label>
            <input
              id="site-password"
              name="password"
              type="password"
              required
              autoFocus
              placeholder="输入密码…"
              autoComplete="current-password"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* 错误提示 */}
          {state && "message" in state && typeof (state as { message: string }).message === "string" && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {(state as { message: string }).message}
            </p>
          )}

          {/* 提交按钮 */}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "验证中…" : "进入站点"}
          </Button>
        </form>

        {/* 底部说明 */}
        <p className="text-center text-xs text-muted-foreground">
          本站点受密码保护。如需访问权限，请联系站长获取密码。
        </p>
      </div>
    </div>
  );
}
