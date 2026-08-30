"use client";
// ↑ Toast 要在浏览器里做"淡入淡出 + 自动消失"动画，必须标 "use client"

import { useEffect, useRef, useState } from "react";

type ToastProps = {
  message: string;
  type?: "success" | "error"; // 成功绿 / 错误红
  onClose: () => void; // 动画结束后通知父组件把我卸掉
  duration?: number; // 停留毫秒，默认 2500
};

// Toast 是个"受控展示"组件：父组件决定"是否挂载我"，我内部负责淡入淡出 + 到点通知卸载
export default function Toast({
  message,
  type = "success",
  onClose,
  duration = 2500,
}: ToastProps) {
  // shown 控制"是否可见"。挂载时是 false（藏在上方），useEffect 里立刻变 true（淡入）
  const [shown, setShown] = useState(false);

  // 用 ref 持有"最新的 onClose"。这样定时器 effect 的依赖里可以只留 duration：
  // 若把 onClose 直接写进依赖，父组件重渲染（onClose 未 memo 时引用每次都变）会
  // 清掉旧定时器重开新的 → Toast 一直不消失。用 ref 能既拿到最新回调、又不重启定时器，
  // 也就不需要用 eslint-disable 关规则（React Compiler 会拒绝优化带 disable 的组件）。
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    // ① 下一帧把 shown 设 true → 触发 CSS 过渡（从上方淡入）
    const raf = requestAnimationFrame(() => setShown(true));
    // ② duration 后开始淡出
    const hideTimer = setTimeout(() => setShown(false), duration);
    // ③ 淡出动画(300ms)结束后再通知父组件卸掉我，避免"突然消失"的闪烁
    const closeTimer = setTimeout(() => onCloseRef.current(), duration + 300);

    // ④ 清理：组件卸载或重渲染前清掉定时器，防止内存泄漏/重复触发
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hideTimer);
      clearTimeout(closeTimer);
    };
  }, [duration]);

  const isSuccess = type === "success";
  // 颜色用设计令牌（hsl 包裹，和配色 token 同一套），不写死 hex
  const accent = isSuccess ? "hsl(var(--success))" : "hsl(var(--destructive))";

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        top: 20,
        left: "50%",
        transform: shown
          ? "translateX(-50%) translateY(0)"
          : "translateX(-50%) translateY(-12px)",
        opacity: shown ? 1 : 0,
        transition: "opacity 300ms ease, transform 300ms ease",
        zIndex: 50,
        pointerEvents: "none", // 提示条不挡下面的点击
        background: "hsl(var(--card))",
        color: "hsl(var(--foreground))",
        borderLeft: `4px solid ${accent}`,
        borderRadius: 10,
        padding: "10px 18px",
        fontSize: 14,
        boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
        fontWeight: 500,
      }}
    >
      <span style={{ marginRight: 8 }}>{isSuccess ? "✅" : "⚠️"}</span>
      {message}
    </div>
  );
}
