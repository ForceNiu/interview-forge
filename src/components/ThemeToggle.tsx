"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

// 主题切换：在 <html> 上切 .dark，组件层所有颜色走 var(--xxx) 自动联动（零组件改动）。
// 实际换肤由 globals.css 的 .dark {} 槽位驱动；本组件只负责状态切换与持久化。
// 防闪白（FOUC）由 layout.tsx 的内联脚本在绘制前按 localStorage 设好 .dark 保证。
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 内联脚本已在绘制前按 localStorage 设好 .dark，这里同步按钮文案状态
  useEffect(() => {
    // 挂载时从 DOM 读取一次主题类，避免服务端渲染与客户端不一致
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains("dark"));
    setMounted(true);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* localStorage 不可用时忽略，仅本次会话生效 */
    }
    setIsDark(next);
  }

  // 挂载前渲染中性图标，避免服务端/客户端首屏不一致
  const label = !mounted ? "主题" : isDark ? "浅色" : "深色";

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      aria-label={isDark ? "切换到浅色模式" : "切换到深色模式"}
      suppressHydrationWarning
      className="gap-1.5"
    >
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
