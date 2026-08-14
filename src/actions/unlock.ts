"use server";

/**
 * 解锁 / 验证站点访问密码
 *
 * 为什么是 Server Action 而不是 API Route：
 *   - 项目其余写操作都用 Server Action（questions.ts / tags.ts），保持一致
 *   - Next.js 自动生成 POST 端点，不用手动写 route handler
 *   - 可以直接用 cookies() API 设 httpOnly Cookie（API Route 也能做，但 SA 更简洁）
 *
 * 安全要点：
 *   - 密码比对在服务端进行，原文永远不会出现在浏览器 JS 里
 *   - Cookie 设为 httpOnly + Secure + SameSite=Strict → XSS 窃不走、跨站带不走
 *   - 不返回"密码错误"vs"用户不存在"的区分 → 防枚举（虽然单用户无所谓）
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sanitizeFrom } from "@/lib/security";

/**
 * 验证密码并设置认证 Cookie
 * @param password 用户输入的密码
 * @param from 验证成功后要跳回的原始路径（从 ?from= 参数传入）
 */
export async function unlockSite(password: string, from?: string) {
  // 从环境变量读取正确密码（部署时在 Vercel 后台配 SITE_PASSWORD）
  const correctPassword = process.env.SITE_PASSWORD;

  // 未配置密码 → 视为"不需要保护"，直接放行
  // 未配置密码 → 视为"开放站点"，直接发 Cookie 放行（防御性，避免任何死循环）
  // 正常情况下 middleware 已对未配置密码直接放行，此分支仅兜底
  if (!correctPassword) {
    const cookieStore = await cookies();
    cookieStore.set("site_auth", "1", {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect(sanitizeFrom(from)); // 同样经开放重定向防护，from 含外站地址也不会带出站
    return;
  }

  // 密码不对 → 返回错误（不透露具体原因）
  if (password !== correctPassword) {
    return { success: false, message: "密码不正确，请重试" };
  }

  // 密码正确 → 设认证 Cookie（30 天有效）
  const cookieStore = await cookies();
  cookieStore.set("site_auth", "1", {
    httpOnly: true,   // JS 读不到（防 XSS 窃取）
    secure: true,      // 仅 HTTPS 传输（Vercel 部署自动 HTTPS）
    sameSite: "strict",// 严格同站（防 CSRF）
    path: "/",        // 全站有效
    maxAge: 60 * 60 * 24 * 30, // 30 天
  });

  // 跳回用户原本想去的页面，默认回首页
  redirect(sanitizeFrom(from));
}
