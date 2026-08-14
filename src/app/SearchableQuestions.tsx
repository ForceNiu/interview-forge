// 站1：这一行 "use client" 是整站1 的核心。
// 它告诉 Next.js：这个组件要在【浏览器】里运行（不是服务器）。
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import DeleteButton from "@/components/DeleteButton";
import FavoriteButton from "@/components/FavoriteButton";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Toast from "@/components/Toast";
// ① 后端搜索用的 Server Action（"use server" 文件里的函数，客户端可直接当异步函数调用）
import { searchQuestions } from "@/actions/questions";
// ① 300ms 防抖 hook（避免每次按键都打后端）
import { useDebounce } from "@/lib/useDebounce";
import { difficultyLabel, difficultyColor } from "@/lib/difficulty";
// ③ 标签文字按背景明度自动反色
import { textOn } from "@/lib/color";
import type { Prisma } from "@prisma/client";

type QuestionWithTags = Prisma.QuestionGetPayload<{
  include: { tags: { include: { tag: true } } };
}>;

// 组件通过 props 收到 questions（由 Server Component 查好后传进来）
export default function SearchableQuestions({
  questions,
}: {
  questions: QuestionWithTags[];
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [serverResults, setServerResults] = useState<QuestionWithTags[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  // ① 真正的搜索请求：防抖词非空时打到 Server Action（后端连库模糊查 标题+正文）
  const runSearch = useCallback(async (q: string) => {
    const id = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await searchQuestions(q);
      if (reqIdRef.current === id) {
        setServerResults(res);
        setLoading(false);
      }
    } catch {
      if (reqIdRef.current === id) {
        setError("搜索失败，请重试");
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (q === "") {
      reqIdRef.current++;
      setServerResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    runSearch(q);
  }, [debouncedSearch, runSearch]);

  // ⑤ 正在淡出的题目快照：删除成功后先留着画图，动画结束再卸掉
  const [fading, setFading] = useState<Record<string, QuestionWithTags>>({});
  const [showToast, setShowToast] = useState(false);

  const base = serverResults ?? questions;
  const map = new Map<string, QuestionWithTags>();
  base.forEach((q) => map.set(q.id, q));
  Object.values(fading).forEach((q) => {
    if (!map.has(q.id)) map.set(q.id, q);
  });
  const all = Array.from(map.values());

  // ⑥ 空状态分流：数据库本就空（且无搜索）vs 搜索无果，文案不同
  const dbEmpty = questions.length === 0;
  const searching = search.trim() !== "";

  // ⑤ 删除成功回调：留快照 + 弹 toast + 400ms 后卸掉
  const handleDeleted = (q: QuestionWithTags) => {
    setFading((prev) => ({ ...prev, [q.id]: q }));
    setShowToast(true);
    setTimeout(() => {
      setFading((prev) => {
        const next = { ...prev };
        delete next[q.id];
        return next;
      });
    }, 400);
    if (serverResults) {
      runSearch(debouncedSearch.trim());
    }
  };

  return (
    <>
      {/* 头部：标题 + 操作按钮，计数跟随当前过滤结果（all.length）实时变化 */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          题库一共有 {all.length} 道
        </h1>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/tags">标签管理</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/questions/new">+ 新增题目</Link>
          </Button>
        </div>
      </div>

      {/* ⑦ 搜索框 + 清除按钮：有输入时才显示 ✕ */}
      <div className="relative mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索题目（标题或正文）..."
          className="pr-9"
        />
        {loading ? (
          <span
            aria-label="搜索中"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground animate-pulse"
          >
            …
          </span>
        ) : (
          search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="清除搜索"
              className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-sm text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )
        )}
      </div>
      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {/* 站4：无结果提示（空状态分流） */}
      {all.length === 0 ? (
        dbEmpty && !searching ? (
          <div className="py-10 text-center">
            <p className="mb-3 text-muted-foreground">题库还是空的，先新增第一道题吧。</p>
            <Button asChild size="sm">
              <Link href="/questions/new">+ 新增题目</Link>
            </Button>
          </div>
        ) : (
          <p className="py-6 text-center text-muted-foreground">
            没找到匹配「{search}」的题目
          </p>
        )
      ) : (
        <ul className="list-none m-0 space-y-3 p-0">
          {all.map((q) => {
            const isFading = !!fading[q.id] && !base.some((p) => p.id === q.id);
            return (
              <li key={q.id}>
                {/* ⑥ 卡片：默认 hover 浮起；淡出中则透明+缩小，transition 平滑过渡 */}
                <Card
                  className={
                    "group p-4 transition-all duration-300 " +
                    (isFading
                      ? "scale-95 opacity-0"
                      : "hover:-translate-y-0.5 hover:shadow-md")
                  }
                >
                  <Link
                    href={`/questions/${q.id}`}
                    className="text-lg font-semibold text-foreground hover:text-primary"
                  >
                    {q.title}
                  </Link>
                  <div className="mt-2 text-sm">
                    <span
                      className="mr-3 font-semibold"
                      style={{ color: difficultyColor(q.difficulty) }}
                    >
                      难度：{difficultyLabel(q.difficulty)}（{q.difficulty}）
                    </span>
                    {q.tags.map((qt) => (
                      <span
                        key={qt.tag.id}
                        className="mr-1.5 rounded px-2 py-0.5 text-xs"
                        style={{ background: qt.tag.color, color: textOn(qt.tag.color) }}
                      >
                        {qt.tag.name}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <FavoriteButton id={q.id} initialFavorite={q.favorite} />
                    {/* 删除是低频高危操作：桌面端默认隐去，hover 卡片或键盘聚焦时才显形，降低误点 + 视觉噪音 */}
                    <span className="opacity-0 transition-opacity focus-within:opacity-100 md:group-hover:opacity-100">
                      <DeleteButton id={q.id} onDeleted={() => handleDeleted(q)} />
                    </span>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {showToast && (
        <Toast message="题目已删除" type="success" onClose={() => setShowToast(false)} />
      )}
    </>
  );
}
