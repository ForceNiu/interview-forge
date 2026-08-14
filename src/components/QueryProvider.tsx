"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// QueryClientProvider 是"壳"：把 queryClient（缓存管理器）挂到整棵组件树。
// 下面的任意组件写 useQuery / useMutation 都能连到同一个缓存。
export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // 关键：用 useState 初始化一次，保证整个 app 生命周期内只有这一个 QueryClient。
  // 不用 useState 直接 new QueryClient() 的话，每次重渲染都会新建 → 缓存被清空。
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
