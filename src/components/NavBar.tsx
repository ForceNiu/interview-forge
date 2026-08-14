"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

// 导航栏：客户端组件（需要 usePathname 判断当前页高亮）
const NAV_ITEMS = [
  { href: "/", label: "题库" },
  { href: "/favorites", label: "我的收藏" },
  { href: "/ai-generate", label: "AI 出题" },
  { href: "/questions/new", label: "新增题目" },
  { href: "/tags", label: "标签管理" },
];

function NavLink({ href, label, isActive }: { href: string; label: string; isActive: boolean }) {
  return (
    <Link
      href={href}
      className={
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
        (isActive
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
      }
    >
      {label}
    </Link>
  );
}

export default function NavBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // 解锁页 /unlock：未通过验证的用户不该看到站内导航结构，直接不渲染
  if (pathname === "/unlock") return null;

  // 判断当前页高亮：
  // - 首页 "/"：详情页 /questions/[id] 也归属"题库"，一并高亮
  // - 新增题目 /questions/new：只精确匹配自身，避免被首页的 /questions 前缀抢走
  // - 其余：精确匹配或前缀匹配
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/" || /^\/questions\/[^/]+$/.test(pathname);
    if (href === "/questions/new") return pathname === "/questions/new";
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <nav className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4 sm:px-8">
        {/* 左侧：站点名 */}
        <Link href="/" className="text-base font-bold tracking-tight text-foreground">
          面试手记
        </Link>

        {/* 桌面：横向链接（md 及以上显示） */}
        <div className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} isActive={isActive(item.href)} />
          ))}
          {/* 主题切换：浅色 / 深色一键换肤 */}
          <ThemeToggle />
        </div>

        {/* 移动：汉堡按钮（md 以下显示） */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "关闭菜单" : "打开菜单"}
          aria-expanded={open}
          className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* 移动：展开的下拉菜单（点击链接后自动收起） */}
      {open && (
        <div className="flex flex-col gap-1 border-t border-border bg-background px-4 py-2 md:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={
                "rounded-md px-3 py-2 text-sm font-medium transition-colors " +
                (isActive(item.href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")
              }
            >
              {item.label}
            </Link>
          ))}
          <div className="px-3 py-2">
            <ThemeToggle />
          </div>
        </div>
      )}
    </nav>
  );
}
