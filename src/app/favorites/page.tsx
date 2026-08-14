"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import FavoriteButton from "@/components/FavoriteButton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { difficultyLabel, difficultyColor } from "@/lib/difficulty";
import { textOn } from "@/lib/color";

// 每页条数（与接口默认 limit=50 解耦：收藏页用更小的窗口更聚焦）
const PAGE_SIZE = 10;

type FavoriteItem = {
  id: string;
  title: string;
  difficulty: number;
  favorite: boolean;
  tags: { tag: { id: string; name: string; color: string } }[];
};
// 接口返回的分页信封（envelope）：items 是本页数据，total 是符合条件总数
type FavoritePage = {
  items: FavoriteItem[];
  total: number;
  limit: number;
  offset: number;
};

// 取数函数：拉「只收藏」的题（走 HTTP 接口，带分页参数）
async function fetchFavorites(page: number): Promise<FavoritePage> {
  const offset = (page - 1) * PAGE_SIZE;
  const res = await fetch(
    `/api/questions?favorite=true&limit=${PAGE_SIZE}&offset=${offset}`
  );
  if (!res.ok) throw new Error("加载收藏失败");
  return res.json();
}

export default function FavoritesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  // queryKey 带 page：翻页即换 key，TanStack Query 自动重新请求对应页
  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ["favorites", page],
    queryFn: () => fetchFavorites(page),
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">我的收藏</h1>
        {isFetching && <span className="text-xs text-muted-foreground">更新中…</span>}
        <Button asChild variant="link" className="ml-auto h-auto p-0">
          <Link href="/">← 返回题库</Link>
        </Button>
      </div>

      {isLoading && <p className="py-8 text-center text-muted-foreground">加载中…</p>}

      {isError && (
        <p className="py-8 text-center text-destructive">
          出错了：{(error as Error).message}
        </p>
      )}

      {data && data.items.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          还没有收藏的题目，去题库点 ☆ 收藏吧。
        </p>
      )}

      <ul className="space-y-3">
        {data?.items.map((q) => (
          <li key={q.id}>
            <Card className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link
                  href={`/questions/${q.id}`}
                  className="block truncate font-medium text-foreground hover:text-primary"
                >
                  {q.title}
                </Link>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className="text-xs font-semibold"
                    style={{ color: difficultyColor(q.difficulty) }}
                  >
                    难度：{difficultyLabel(q.difficulty)}（{q.difficulty}）
                  </span>
                  {q.tags.map((qt) => (
                    <span
                      key={qt.tag.id}
                      className="rounded px-2 py-0.5 text-xs"
                      style={{ background: qt.tag.color, color: textOn(qt.tag.color) }}
                    >
                      {qt.tag.name}
                    </span>
                  ))}
                </div>
              </div>
              <FavoriteButton
                id={q.id}
                initialFavorite={q.favorite}
                onToggled={() =>
                  // 失效整个 favorites 前缀下的缓存（含各页），触发当前页重新拉取
                  queryClient.invalidateQueries({ queryKey: ["favorites"] })
                }
              />
            </Card>
          </li>
        ))}
      </ul>

      {/* 多页时才显示翻页控件：上一页/页码/下一页 */}
      {data && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            第 {page} / {totalPages} 页（共 {total} 条）
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            下一页
          </Button>
        </div>
      )}
    </main>
  );
}
