import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // React Compiler：自动 memoize 组件与 hooks，替代手写 memo/useCallback/useMemo。
  // Next.js 16 起为顶层配置（非 experimental），与现有手写优化共存，可渐进式清理。
  reactCompiler: true,
  // 标准配置：让 webpack 不要把 Prisma 客户端打进 bundle，
  // 否则 SSR 运行时解析到空壳会报 "did not initialize yet"。
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  // 允许通过 127.0.0.1 访问 dev 服务：否则 Next16 会拦截 HMR，导致浏览器 hydration 失败
  allowedDevOrigins: ['127.0.0.1'],
  // 显式把项目目录设成 turbopack 根目录
  // 背景：上级目录 /Users/nzmin/WorkBuddy/AI 也有 package-lock.json,
  // turbopack 推断时会选错的根,导致 dev 编译报 502 (找不到 src/app)
  turbopack: {
    root: path.dirname(new URL(import.meta.url).pathname),
  },
};

export default nextConfig;
