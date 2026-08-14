import { createLLM } from "@/lib/ai/client";

/**
 * POST /api/ai/test
 * 验证 DeepSeek 连接是否正常
 * 返回 { ok: true, message: "..." } 或 { error: "..." }
 */
export async function POST() {
  try {
    const llm = await createLLM();
    const response = await llm.invoke("请回复'连接成功'");

    return Response.json({
      ok: true,
      message: response.content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    return Response.json({ error: message }, { status: 500 });
  }
}
