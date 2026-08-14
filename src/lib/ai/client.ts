import { cookies } from "next/headers";
import { decryptApiKey } from "@/lib/crypto";
import http from "http";
import net from "net";
import tls from "tls";
import https from "https";

// DeepSeek 兼容 OpenAI 协议
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

/**
 * 🔧 为什么不用 @langchain/openai 的 ChatOpenAI / 也不用全局 fetch：
 *
 * 在 Next.js 运行时里，ChatOpenAI（底层 OpenAI SDK）的 fetch 层会「间歇性挂死」——
 * 第一次 LLM 调用正常，之后某次调用挂起直到 30s 超时（LangGraph 节点超时）。
 * standalone（纯 node）完全正常，只在 Next 里复现。
 *
 * 根因（已用探针路由在 dev server 内实测确认）：
 *   后台长驻的 Next 服务出网优先走 HTTPS_PROXY（沙箱代理，端口随环境变化），
 *   而 Node 的全局 fetch / undici 默认【不读】代理环境变量 → 某些沙箱环境直连会被防火墙静默丢弃 → 挂死；
 *   给 undici 传自定义 ProxyAgent dispatcher 又被 Turbopack 打包破坏（dispatcher 被忽略）。
 *
 * 本方案：直接用 Node 内置 http/tls/https 发 HTTPS 请求。
 *   - 配置了 HTTPS_PROXY → 走「HTTP 代理 CONNECT 隧道」（显式走代理，规避挂死）；
 *   - 未配置代理 → 直连兜底（沙箱直连放行时也能出网，代理不可用不阻塞）。
 *   这些是 Node 内置模块，Turbopack 当 external 处理、不会打包破坏。
 * 对外暴露与 ChatOpenAI 等价的 invoke(messages, options?) → { content } 接口，
 * workflow.ts 里所有 llm.invoke(...) 调用零改动。
 */
type LLMMessage = { content?: unknown; _getType?: () => string; role?: string };

function toDeepSeekMessages(input: unknown): { role: string; content: string }[] {
  if (typeof input === "string") return [{ role: "user", content: input }];
  return (input as LLMMessage[]).map((m) => {
    const type = typeof m._getType === "function" ? m._getType() : (m.role ?? "user");
    const role =
      type === "system" ? "system"
      : type === "assistant" || type === "ai" ? "assistant"
      : "user";
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "");
    return { role, content };
  });
}

interface ProxyResp {
  status: number;
  body: string;
}

/** 无代理时直连 HTTPS（与 httpsViaProxy 等价，省去 CONNECT 隧道；代理不可用时兜底） */
function httpsDirect(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
  timeoutMs = 300000
): Promise<ProxyResp> {
  const target = new URL(url);
  return new Promise<ProxyResp>((resolve, reject) => {
    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error("直连请求超时"));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      req.destroy();
      reject(new Error("请求已取消"));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const req = https.request(
      {
        method,
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        headers: { Host: target.hostname, "Content-Length": Buffer.byteLength(body), ...headers },
      },
      (resp) => {
        let data = "";
        resp.on("data", (c) => (data += c));
        resp.on("end", () => {
          clearTimeout(timer);
          resolve({ status: resp.statusCode ?? 0, body: data });
        });
      }
    );
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    req.write(body);
    req.end();
  });
}

/** 通过 HTTP 代理的 CONNECT 隧道发 HTTPS 请求（绕过 undici/Next fetch 的代理与打包问题） */
function httpsViaProxy(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  signal?: AbortSignal,
  timeoutMs = 300000
): Promise<ProxyResp> {
  const proxy = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || "").replace(/^https?:\/\//, "");
  if (!proxy) {
    // 未配置代理 → 直连（沙箱直连放行时走此分支，代理不可用也不阻塞出网）
    return httpsDirect(url, method, headers, body, signal, timeoutMs);
  }

  const [ph, pp] = proxy.split(":");
  const target = new URL(url);
  const port = target.port || 443;

  return new Promise<ProxyResp>((resolve, reject) => {
    const timer = setTimeout(() => {
      connectReq.destroy();
      reject(new Error("代理请求超时"));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      connectReq.destroy();
      reject(new Error("请求已取消"));
    };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    const connectReq = http.request({
      host: ph,
      port: Number(pp),
      method: "CONNECT",
      path: `${target.hostname}:${port}`,
      headers: { Host: `${target.hostname}:${port}` },
      timeout: 15000,
    });

    connectReq.on("connect", (res: any, socket: net.Socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        clearTimeout(timer);
        return reject(new Error(`代理 CONNECT 失败: ${res.statusCode}`));
      }
      const tlsSocket = tls.connect({ socket, servername: target.hostname }, () => {
        const req = https.request(
          {
            method,
            path: target.pathname + target.search,
            headers: { Host: target.hostname, "Content-Length": Buffer.byteLength(body), ...headers },
            createConnection: () => tlsSocket,
          },
          (resp) => {
            let data = "";
            resp.on("data", (c) => (data += c));
            resp.on("end", () => {
              clearTimeout(timer);
              resolve({ status: resp.statusCode ?? 0, body: data });
            });
          }
        );
        req.on("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        req.write(body);
        req.end();
      });
      tlsSocket.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
    });

    connectReq.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    connectReq.on("timeout", () => {
      connectReq.destroy();
      clearTimeout(timer);
      reject(new Error("CONNECT 超时"));
    });
    connectReq.end();
  });
}

class DeepSeekLLM {
  constructor(private apiKey: string) {}

  async invoke(
    input: unknown,
    options?: { signal?: AbortSignal }
  ): Promise<{ content: string }> {
    const messages = toDeepSeekMessages(input);
    const apiUrl = `${DEEPSEEK_BASE_URL}/v1/chat/completions`;
    const body = JSON.stringify({ model: DEEPSEEK_MODEL, messages, temperature: 0.7 });

    let lastErr: Error | null = null;
    // 指数退避重试：重点应对 HTTP 429（限流），其他瞬时错误也兜底
    for (let attempt = 1; attempt <= 4; attempt++) {
      // 已被上层 withTimeout 超时/取消 → 不自己重试，直接交还错误给上层（避免无谓重试）
      if (options?.signal?.aborted) {
        throw new Error("请求已被上层超时取消");
      }
      try {
        const res = await httpsViaProxy(
          apiUrl, "POST",
          { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body, options?.signal
        );

        // —— 真实状态码日志：每次调用都打印 DeepSeek 返回的 HTTP status，方便确认是否触发限流 ——
        console.log(`[LLM] DeepSeek 返回 status=${res.status}（第 ${attempt} 次调用）`);

        if (res.status === 200) {
          const data = JSON.parse(res.body) as { choices?: { message?: { content?: string } }[] };
          const content = data?.choices?.[0]?.message?.content ?? "";
          return { content };
        }
        if (res.status === 429) {
          lastErr = new Error(`DeepSeek 返回 429（触发限流）`);
          if (attempt < 4) {
            const wait = Math.min(2 ** (attempt - 1) * 1000, 8000);
            console.warn(`[LLM] 触发限流，退避 ${wait}ms 后重试（第 ${attempt}/3 次）`);
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          throw lastErr;
        }
        // 其他 HTTP 错误（400 参数/401 key 无效等）：直接抛出，不重试
        throw new Error(`DeepSeek 返回 ${res.status}: ${res.body.slice(0, 200)}`);
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        // 上层超时(abort)导致的取消：不要自己重试，交还上层
        if (options?.signal?.aborted) throw err;
        lastErr = err;
        console.error(`[LLM] 调用异常（第 ${attempt} 次）：${err.message}`);
        if (attempt < 4) {
          const wait = Math.min(2 ** (attempt - 1) * 500, 4000);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr ?? new Error("LLM 调用失败");
  }
}

/**
 * 获取 API Key 的策略：
 * 1) 优先从 httpOnly Cookie 中解密用户自行提供的 Key（生产环境用这个）
 * 2) Cookie 不存在或解密失败 → 回退到 .env 的 DEEPSEEK_API_KEY（开发环境用）
 * 3) 都没有 → 返回 null（调用方自行处理错误）
 */
async function getApiKey(): Promise<string | null> {
  // ① 尝试从 Cookie 读取（生产环境路径）
  const cookieStore = await cookies();
  const encryptedKey = cookieStore.get("ai_key")?.value;
  if (encryptedKey) {
    const decrypted = decryptApiKey(encryptedKey);
    if (decrypted) return decrypted;
    return null;
  }

  // ② Cookie 不存在 → 回退到 .env（开发环境路径）
  return process.env.DEEPSEEK_API_KEY ?? null;
}

/**
 * 创建 DeepSeek LLM 客户端
 * 如果没有任何可用 Key，抛出错误
 */
export async function createLLM(): Promise<DeepSeekLLM> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("未找到可用的 API Key：请在设置中填写 DeepSeek API Key");
  }
  return new DeepSeekLLM(apiKey);
}
