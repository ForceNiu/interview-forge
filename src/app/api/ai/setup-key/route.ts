import { encryptApiKey } from "@/lib/crypto";
import { cookies } from "next/headers";

/**
 * POST /api/ai/setup-key
 *
 * 接收前端传来的 API Key → 加密 → 写入 httpOnly Cookie
 * Cookie 设置：
 *   - httpOnly: true（JS 无法访问，防 XSS）
 *   - secure: true（仅 HTTPS）
 *   - sameSite: "strict"（防 CSRF）
 *   - maxAge: 30 天
 */
export async function POST(request: Request) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return Response.json({ error: "请提供 API Key" }, { status: 400 });
    }

    const encrypted = encryptApiKey(apiKey.trim());
    const cookieStore = await cookies();

    cookieStore.set("ai_key", encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60, // 30 天
      path: "/",
    });

    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "设置失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
