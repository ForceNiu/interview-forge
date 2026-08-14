/**
 * 站点访问密码门（proxy，代理 —— Next.js 16 取代 middleware 的新约定）
 *
 * 工作原理：
 *   每个请求进来到这里 → 检查 Cookie "site_auth"
 *     有且值正确 → 放行（用户无感）
 *     没有/不对  → 重定向到 /unlock（密码输入页）
 *
 * 为什么用 proxy 而不用页面级校验：
 *   proxy 在请求完成前、路由渲染之前于服务端执行，比页面渲染更早拦截。
 *   它能保护所有路由——包括 /api/* 接口、动态路由、甚至不存在的路径。
 *   这是 Next.js 官方推荐的"全站守卫"模式（Next.js 16 起 middleware 已弃用，改用 proxy）。
 *
 * 运行时：Next.js 16 的 proxy 默认 Node.js runtime（非 Edge），可直接读 process.env。
 *
 * 免费替代 Vercel Password Protection（需 Pro $150/月）。
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 不需要密码就能访问的路径（密码页本身必须放行，否则无限重定向） */
const PUBLIC_PATHS = ["/unlock"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 仅生产环境启用密码门：
  //   - 开发环境（NODE_ENV !== "production"）无论是否设 SITE_PASSWORD 都全开放 → 本地免登录直接看
  //   - 生产环境（Vercel 部署时 NODE_ENV 自动为 "production"）+ 设了 SITE_PASSWORD → 拦截到 /unlock
  //   - 未配置 SITE_PASSWORD 也全开放（兜底，避免空密码导致无限重定向）
  if (process.env.NODE_ENV !== "production" || !process.env.SITE_PASSWORD) {
    return NextResponse.next();
  }

  // 密码输入页始终放行
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // 检查认证 Cookie（httpOnly，JS 读不到，只能服务端/proxy 判定）
  const authCookie = request.cookies.get("site_auth");

  // Cookie 缺失或值不匹配 → 拦截到密码页
  // 值 "1" 是在 unlock Server Action 验证通过后设的，不是密码原文
  if (!authCookie || authCookie.value !== "1") {
    const url = request.nextUrl.clone();
    url.pathname = "/unlock";
    // 记住用户原本想去的地址，输对密码后跳回去
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // 有有效 Cookie → 正常放行
  return NextResponse.next();
}

/**
 * matcher 决定 proxy 对哪些请求生效：
 * - 排除 _next/static（静态资源）、_next/image（图片优化）、favicon、图标文件
 * - 其余所有路径（页面、API 路由、动态路由）全部经过密码检查
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|woff2?)).*)",
  ],
};
