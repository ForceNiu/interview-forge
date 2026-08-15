// 站1：这一行 "use client" 是整站1 的核心。
// 它告诉 Next.js：这个组件要在【浏览器】里运行（不是服务器）。
"use client";

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
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
// ① 搜索结果高亮：标题命中词高亮 + 正文摘要（让「正文命中」的题看得出缘由）
import { highlight, getSnippet } from "@/lib/search-ui";
import type { Prisma } from "@prisma/client";

type QuestionWithTags = Prisma.QuestionGetPayload<{
  include: { tags: { include: { tag: true } } };
}>;

type QuestionCardProps = {
  q: QuestionWithTags;
  search: string;
  serverResults: QuestionWithTags[] | null;
  isFading: boolean;
  onDeleted: (q: QuestionWithTags) => void;
};

// ① 单张题目卡片：用 memo 包裹。
// 父组件（题库列表）在每次打字/状态变化时都会重渲染，但卡片只在自身 props 变化时才重渲染——
// 例如翻页淡出别的题、弹出 toast、切换标签过滤时，没变的卡片跳过重渲染，避免整列重算。
const QuestionCard = memo(function QuestionCard({
  q,
  search,
  serverResults,
  isFading,
  onDeleted,
}: QuestionCardProps) {
  const searching = search.trim() !== "";

  // 卡片内层把 onDeleted(q) 包成稳定回调：DeleteButton 是 memo 组件，
  // 给它传稳定引用才能避免它本身跟着父（卡片）重渲染而反复重跑 effect。
  const handleCardDeleted = useCallback(() => onDeleted(q), [onDeleted, q]);

  return (
    <li>
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
          {highlight(q.title, search)}
        </Link>
        <div className="mt-2 text-sm">
          <span
            className="mr-3 font-semibold"
            style={{ color: difficultyColor(q.difficulty) }}
          >
            难度：{difficultyLabel(q.difficulty)}（{q.difficulty}）
          </span>
          {q.tags.map((qt) => (
            // ① 标签 chip 改为可点击：跳首页并带 ?tag= 过滤，实现"按标签下钻"
            <Link
              key={qt.tag.id}
              href={`/?tag=${encodeURIComponent(qt.tag.name)}`}
              className="mr-1.5 rounded px-2 py-0.5 text-xs transition-opacity hover:opacity-80"
              style={{ background: qt.tag.color, color: textOn(qt.tag.color) }}
            >
              {qt.tag.name}
            </Link>
          ))}
        </div>
        {/* ① 搜索态：在标题下方显示正文摘要并高亮命中词，让「正文命中」的题看得出缘由。
            仅 searching && serverResults（即真正走了后端搜索）时显示；初始全量列表不显示以保持简洁。 */}
        {searching && serverResults && (() => {
          const needle = search.trim().toLowerCase();
          // 标题/正文都未命中、但结果里出现了 → 必是标签命中，显式标出以免"不知为何被搜出"
          const hitByTag =
            needle !== "" &&
            !q.title.toLowerCase().includes(needle) &&
            !q.content.toLowerCase().includes(needle);
          return hitByTag ? (
            <span className="mt-2 inline-block rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              标签命中
            </span>
          ) : null;
        })()}
        {searching && serverResults && q.content && (
          <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {highlight(getSnippet(q.content, search), search)}
          </p>
        )}
        <div className="mt-3 flex items-center gap-2">
          <FavoriteButton id={q.id} initialFavorite={q.favorite} />
          {/* 删除是低频高危操作：桌面端默认隐去，hover 卡片或键盘聚焦时才显形，降低误点 + 视觉噪音 */}
          <span className="opacity-0 transition-opacity focus-within:opacity-100 md:group-hover:opacity-100">
            <DeleteButton id={q.id} onDeleted={handleCardDeleted} />
          </span>
        </div>
      </Card>
    </li>
  );
});

// 组件通过 props 收到 questions（由 Server Component 查好后传进来）
export default function SearchableQuestions({
  questions,
  activeTag,
}: {
  questions: QuestionWithTags[];
  // ① 从 URL ?tag=xxx 传入的当前标签过滤（标签 chip 点击下钻时带上的）
  activeTag?: string;
}) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [serverResults, setServerResults] = useState<QuestionWithTags[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ① 标签过滤态：初始值来自 URL（如从标签页点「网络」跳过来）；用户可点 ✕ 清除
  const [tagFilter, setTagFilter] = useState<string | undefined>(activeTag);
  const reqIdRef = useRef(0);

  // ① 真正的搜索请求：防抖词非空时打到 Server Action（后端连库模糊查 标题+正文+标签）
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

  // ⑤ 删除成功回调：留快照 + 弹 toast + 400ms 后卸掉。
  // 用 useCallback 稳定引用：传给各 QuestionCard 后，卡片 memo 才能在不相关状态变化时跳过重渲染。
  const handleDeleted = useCallback(
    (q: QuestionWithTags) => {
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
    },
    [serverResults, debouncedSearch, runSearch]
  );

  // base：当前"真实存在"的题目集合（服务端结果 or 全量）。
  // 仅用于淡出判定：某题进入 fading 快照、但已不在 base 里，说明它确实被删了 → 保持淡出态。
  const base = serverResults ?? questions;
  const baseIds = useMemo(() => new Set(base.map((q) => q.id)), [base]);

  // ⑤ 派生列表：服务端结果 or 全量 → 叠加标签过滤 → 再并入淡出快照。
  // 用 useMemo 缓存，避免每次渲染都重建 Map（题库大时省掉 O(n) 重复计算）。
  const all = useMemo(() => {
    const baseTagged = tagFilter
      ? base.filter((q) => q.tags.some((qt) => qt.tag.name === tagFilter))
      : base;
    const map = new Map<string, QuestionWithTags>();
    baseTagged.forEach((q) => map.set(q.id, q));
    Object.values(fading).forEach((q) => {
      if (!map.has(q.id)) map.set(q.id, q);
    });
    return Array.from(map.values());
  }, [base, tagFilter, fading]);

  // ⑥ 空状态分流：数据库本就空（且无搜索）vs 搜索无果，文案不同
  const dbEmpty = questions.length === 0;
  const searching = search.trim() !== "";

  return (
    <>
      {/* 头部：标题 + 操作按钮，计数跟随当前过滤结果（all.length）实时变化 */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            题库一共有 {all.length} 道
          </h1>
          {/* ① 标签过滤态：显示当前标签 + ✕ 清除，点 ✕ 回到全量 */}
          {tagFilter && (
            <button
              type="button"
              onClick={() => setTagFilter(undefined)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
            >
              标签：{tagFilter} ✕
            </button>
          )}
        </div>
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
          placeholder="搜索题目（标题/正文/标签）..."
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
            const isFading = !!fading[q.id] && !baseIds.has(q.id);
            return (
              <QuestionCard
                key={q.id}
                q={q}
                search={search}
                serverResults={serverResults}
                isFading={isFading}
                onDeleted={handleDeleted}
              />
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
