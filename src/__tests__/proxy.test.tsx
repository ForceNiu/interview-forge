// proxy.ts 纯逻辑单测（安全路径：全站密码门）
// 关键约束：testMatch 只匹配 *.test.tsx，故文件名必须为 .tsx（即使里面无 JSX）。
// proxy 依赖 next/server 的 NextRequest/NextResponse，这里整体 mock 掉，
// 用轻量假实现验证「放行 / 拦截重定向」分支与开发环境短路逻辑。

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// ---- 假 NextRequest / NextResponse ----
// 真实 NextRequest 是只读 URL 封装，这里用可变对象模拟 proxy 用到的字段。
function makeRequest(pathname: string, cookieValue?: string) {
  const cookies = new Map<string, string>();
  if (cookieValue !== undefined) cookies.set("site_auth", cookieValue);
  return {
    nextUrl: { pathname, clone: () => makeUrl(pathname) },
    cookies: { get: (name: string) => (cookieValue !== undefined ? { value: cookieValue } : undefined) },
  } as any;
}

function makeUrl(pathname: string) {
  const searchParams = new Map<string, string>();
  return {
    pathname,
    searchParams: {
      set: (k: string, v: string) => searchParams.set(k, v),
      get: (k: string) => searchParams.get(k),
    },
  };
}

// NextResponse.next() 返回放行标记；redirect() 返回带目标地址的拦截标记
const mockNext = jest.fn(() => ({ type: "next" }));
const mockRedirect = jest.fn((url: any) => ({ type: "redirect", url }));

jest.mock("next/server", () => ({
  NextResponse: {
    next: () => mockNext(),
    redirect: (url: any) => mockRedirect(url),
  },
}));

// 在 mock 生效前让 proxy 模块加载（proxy 仅 import NextResponse，逻辑在调用时执行）
// 用 require 而非 import：确保 next/server 的 mock 在模块加载时已生效
const { proxy } = require("../proxy");

const setEnv = (env: Record<string, string | undefined>) => {
  const saved: Record<string, string | undefined> = {};
  for (const k of ["NODE_ENV", "SITE_PASSWORD"]) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  return () => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
};

beforeEach(() => {
  mockNext.mockClear();
  mockRedirect.mockClear();
});

describe("proxy 密码门—开发环境短路", () => {
  it("NODE_ENV 非 production → 无论有无密码都直接放行（开发免登录）", () => {
    const restore = setEnv({ NODE_ENV: "development", SITE_PASSWORD: "secret" });
    const res = proxy(makeRequest("/questions/abc"));
    restore();
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(res.type).toBe("next");
  });
});

describe("proxy 密码门—生产环境", () => {
  it("未配置 SITE_PASSWORD → 全开放兜底（防空密码死循环）", () => {
    const restore = setEnv({ NODE_ENV: "production", SITE_PASSWORD: undefined });
    const res = proxy(makeRequest("/questions/abc"));
    restore();
    expect(res.type).toBe("next");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("/unlock 自身始终放行（否则无限重定向）", () => {
    const restore = setEnv({ NODE_ENV: "production", SITE_PASSWORD: "secret" });
    const res = proxy(makeRequest("/unlock"));
    restore();
    expect(res.type).toBe("next");
  });

  it("有密码 + 无认证 Cookie → 重定向到 /unlock?from=原路径", () => {
    const restore = setEnv({ NODE_ENV: "production", SITE_PASSWORD: "secret" });
    const res = proxy(makeRequest("/questions/abc"));
    restore();
    expect(mockRedirect).toHaveBeenCalledTimes(1);
    expect(res.type).toBe("redirect");
    // 记住用户原本想去的地址
    expect(res.url.searchParams.get("from")).toBe("/questions/abc");
  });

  it("有密码 + Cookie 值为 1 → 放行", () => {
    const restore = setEnv({ NODE_ENV: "production", SITE_PASSWORD: "secret" });
    const res = proxy(makeRequest("/questions/abc", "1"));
    restore();
    expect(res.type).toBe("next");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("有密码 + Cookie 值非 1（被篡改）→ 重定向拦截", () => {
    const restore = setEnv({ NODE_ENV: "production", SITE_PASSWORD: "secret" });
    const res = proxy(makeRequest("/questions/abc", "0"));
    restore();
    expect(res.type).toBe("redirect");
  });
});
