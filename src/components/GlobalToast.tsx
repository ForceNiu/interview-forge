"use client";
// ↑ 要在浏览器读 URL 参数 + 跳转，必须标 "use client"

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Toast from "./Toast";

// 读 URL 里 ?toast=xxx 的"子组件"。
// 必须用 Suspense 包住，因为 useSearchParams 在 Next.js 里要求挂在一个 Suspense 边界下，
// 否则构建时会报 "useSearchParams() should be wrapped in a suspense boundary"。
function ToastReader() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // message 存"当前要弹的话"。null = 不弹。
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const msg = params.get("toast"); // 例如 ?toast=题目已删除
    if (msg) {
      setMessage(msg); // ① 弹出来
      router.replace(pathname); // ② 把 ?toast= 从地址栏抹掉，防止刷新页面又弹一次
    }
  }, [params, pathname, router]);

  if (!message) return null;
  return (
    <Toast
      message={message}
      type="success"
      onClose={() => setMessage(null)} // Toast 动画结束后卸掉自己
    />
  );
}

// 对外导出的壳：用 Suspense 包一层，满足 Next.js 对 useSearchParams 的要求
export default function GlobalToast() {
  return (
    <Suspense fallback={null}>
      <ToastReader />
    </Suspense>
  );
}
