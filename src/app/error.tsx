"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// 路由级错误兜底（C-7）：Server Component 抛错时不再整页裸红堆栈，而是显示友好卡片。
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 生产环境可在此接错误监控（如 Sentry）；此处仅本地留痕。
    console.error(error);
  }, [error]);

  return (
    <main className="max-w-md mx-auto px-8 py-16">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>页面出错了</CardTitle>
          <CardDescription>加载时发生异常，可重试或返回首页。</CardDescription>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground break-words">
          {error.digest ? `错误标识：${error.digest}` : error.message}
        </CardContent>
        <CardFooter className="flex gap-3 justify-center">
          <Button onClick={reset}>重试</Button>
          <Button variant="outline" asChild>
            <Link href="/">← 返回首页</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
