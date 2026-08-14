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

// 路由级 404 兜底（C-7）。
export default function NotFound() {
  return (
    <main className="max-w-md mx-auto px-8 py-16">
      <Card>
        <CardHeader className="text-center">
          <CardTitle>页面不存在</CardTitle>
          <CardDescription>你访问的页面找不到了。</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href="/">← 返回首页</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
