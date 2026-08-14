// unlock.ts 单测（安全路径：密码比对 + 开放重定向防护）
// 关键约束：
//   - unlockSite 是 Server Action（"use server" 文件不能导出非 async 函数），
//     所以开放重定向防护 sanitizeFrom 已抽到 src/lib/security.ts，这里直接对真实实现测。
//   - cookies() 来自 next/headers，redirect() 来自 next/navigation（真实版会抛 NEXT_REDIRECT 中断执行），
//     全部 mock 掉，避免依赖 Next 运行时。

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { sanitizeFrom } from "@/lib/security";

// ---- mock next/headers: cookies() 返回带 set 的假 store ----
const mockCookieSet = jest.fn();
jest.mock("next/headers", () => ({
  cookies: jest.fn(() => Promise.resolve({ set: (...args: any[]) => mockCookieSet(...args) })),
}));

// ---- mock next/navigation: redirect() 真实会抛 NEXT_REDIRECT 中断函数，这里模拟抛出 ----
const mockRedirect = jest.fn((to: string) => {
  const err: any = new Error("NEXT_REDIRECT");
  err.digest = "NEXT_REDIRECT;replace;" + to;
  throw err;
});
jest.mock("next/navigation", () => ({
  redirect: (to: string) => mockRedirect(to),
}));

// 在 mock 生效后加载 unlockSite
const { unlockSite } = require("../actions/unlock") as typeof import("../actions/unlock");

const setEnv = (env: Record<string, string | undefined>) => {
  const saved = process.env.SITE_PASSWORD;
  if (env.SITE_PASSWORD === undefined) delete process.env.SITE_PASSWORD;
  else process.env.SITE_PASSWORD = env.SITE_PASSWORD;
  return () => {
    if (saved === undefined) delete process.env.SITE_PASSWORD;
    else process.env.SITE_PASSWORD = saved;
  };
};

beforeEach(() => {
  mockCookieSet.mockClear();
  mockRedirect.mockClear();
});

describe("sanitizeFrom 开放重定向防护（核心安全逻辑）", () => {
  it("空值 → 回首页 /", () => {
    expect(sanitizeFrom()).toBe("/");
    expect(sanitizeFrom("")).toBe("/");
  });

  it("普通站内绝对路径 → 原样保留", () => {
    expect(sanitizeFrom("/questions/abc")).toBe("/questions/abc");
  });

  it("协议相对 //evil.com → 回首页（防带出站外）", () => {
    expect(sanitizeFrom("//evil.com")).toBe("/");
  });

  it("完整外站 https://evil.com → 回首页", () => {
    expect(sanitizeFrom("https://evil.com")).toBe("/");
  });

  it("编码后的站内路径 %2F → 解码还原（如 /questions/abc）", () => {
    expect(sanitizeFrom("/questions%2Fabc")).toBe("/questions/abc");
  });

  it("解码后变成协议相对 //evil.com → 回首页", () => {
    // %2F%2Fevil.com 解码为 //evil.com
    expect(sanitizeFrom("%2F%2Fevil.com")).toBe("/");
  });
});

describe("unlockSite 密码门逻辑", () => {
  it("未配置 SITE_PASSWORD → 设 Cookie 并跳回原路径（经 sanitizeFrom 防护，兜底防空密码死循环）", async () => {
    const restore = setEnv({ SITE_PASSWORD: undefined });
    await expect(unlockSite("anything", "/questions")).rejects.toThrow("NEXT_REDIRECT");
    restore();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "site_auth",
      "1",
      expect.objectContaining({ httpOnly: true, sameSite: "strict" })
    );
    expect(mockRedirect).toHaveBeenCalledWith("/questions");
  });

  it("未配置 SITE_PASSWORD + 恶意 ?from=//evil.com → 经 sanitizeFrom 防护落到 /（不开 Redirect 出站）", async () => {
    const restore = setEnv({ SITE_PASSWORD: undefined });
    await expect(unlockSite("anything", "//evil.com")).rejects.toThrow("NEXT_REDIRECT");
    restore();
    expect(mockCookieSet).toHaveBeenCalledWith("site_auth", "1", expect.objectContaining({ httpOnly: true }));
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });

  it("密码错误 → 返回 { success: false }，不签发 Cookie、不跳转", async () => {
    const restore = setEnv({ SITE_PASSWORD: "secret" });
    const r = await unlockSite("wrong-password", "/questions");
    restore();
    expect(r).toEqual({ success: false, message: "密码不正确，请重试" });
    expect(mockCookieSet).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("密码正确 → 签发 httpOnly Cookie 并跳回原路径", async () => {
    const restore = setEnv({ SITE_PASSWORD: "secret" });
    await expect(unlockSite("secret", "/questions/abc")).rejects.toThrow("NEXT_REDIRECT");
    restore();
    expect(mockCookieSet).toHaveBeenCalledWith(
      "site_auth",
      "1",
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: "strict" })
    );
    expect(mockRedirect).toHaveBeenCalledWith("/questions/abc");
  });

  it("密码正确 + 恶意 ?from=//evil.com → 经 sanitizeFrom 防护落到 /（不开 Redirect 出站）", async () => {
    const restore = setEnv({ SITE_PASSWORD: "secret" });
    await expect(unlockSite("secret", "//evil.com")).rejects.toThrow("NEXT_REDIRECT");
    restore();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});
