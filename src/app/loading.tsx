// 路由级加载兜底（C-7）：首屏 Suspense 期间显示，避免白屏。
export default function Loading() {
  return (
    <main className="max-w-3xl mx-auto px-8 py-16 flex flex-col items-center gap-3">
      <span
        className="size-6 rounded-full border-2 border-border border-t-primary animate-spin"
        aria-hidden
      />
      <p className="text-muted-foreground text-sm">加载中…</p>
    </main>
  );
}
