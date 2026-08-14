import { ImageResponse } from "next/og";

// OG / 社交分享预览图（生成后用于微信/飞书/Slack/推特等链接卡片）
// 注意：next/og 的图片引擎(Satori)默认仅内置拉丁字体，中文会渲染成空白，
// 故此处文案全部使用英文，保证跨平台稳定显示。如需中文需额外打包中文字体。
export const runtime = "nodejs";
export const alt = "Interview Forge — Full-Stack Interview Question Bank";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "88px",
          backgroundColor: "#FBF7F0",
          fontFamily: "sans-serif",
        }}
      >
        {/* 顶部品牌锁标 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "56px",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              backgroundColor: "#BC6B4A",
            }}
          />
          <div
            style={{
              fontSize: "26px",
              color: "#6B5C4F",
              letterSpacing: "4px",
            }}
          >
            PORTFOLIO PROJECT
          </div>
        </div>

        {/* 主标题 */}
        <div
          style={{
            fontSize: "92px",
            fontWeight: 700,
            color: "#2D211B",
            lineHeight: 1.05,
            marginBottom: "22px",
          }}
        >
          Interview Forge
        </div>

        {/* 副标题 */}
        <div
          style={{
            fontSize: "38px",
            color: "#6B5C4F",
            marginBottom: "60px",
          }}
        >
          Full-Stack Interview Question Bank &amp; AI Generator
        </div>

        {/* 技术栈标签 */}
        <div style={{ display: "flex", gap: "16px" }}>
          {["Next.js 16", "Prisma", "PostgreSQL", "Tailwind"].map((t) => (
            <div
              key={t}
              style={{
                fontSize: "26px",
                color: "#BC6B4A",
                border: "2px solid #E5DDD0",
                borderRadius: "999px",
                padding: "10px 28px",
                backgroundColor: "#FFFCF7",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
