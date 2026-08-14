"use client";
// ↑ 要弹 Toast（客户端状态），列表必须放客户端组件里

import { useState } from "react";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import TagDeleteButton from "./TagDeleteButton";
import Toast from "@/components/Toast";

// 和 tags/page.tsx 里 findMany 的 include 形状一致
type TagWithCount = Prisma.TagGetPayload<{
  include: { _count: { select: { questions: true } } };
}>;

export default function TagList({ tags }: { tags: TagWithCount[] }) {
  const [showToast, setShowToast] = useState(false);

  return (
    <>
      <div className="space-y-3">
        {tags.length === 0 ? (
          <p className="text-muted-foreground">还没有标签，在上方创建第一个</p>
        ) : (
          tags.map((tag) => (
            <Card
              key={tag.id}
              className="group flex flex-row items-center justify-between px-4 py-3"
            >
              {/* ① 整行可点击下钻：跳首页并按此标签过滤，让"网络（5 道题）"点得进去看到那 5 道 */}
              <Link
                href={`/?tag=${encodeURIComponent(tag.name)}`}
                className="flex flex-1 items-center gap-3 hover:opacity-80"
              >
                <span className="h-5 w-5 rounded" style={{ background: tag.color }} />
                <span className="font-medium text-foreground">{tag.name}</span>
                <span className="text-sm text-muted-foreground">
                  （{tag._count.questions} 道题）
                </span>
              </Link>
              {/* 删成功 → 弹"标签已删除"轻提示 */}
              {/* 被引用中（>0 题）→ 常显灰色"使用中"；0 题可删 → 默认就显示红色删除按钮（用户一眼能看出可删） */}
              {tag._count.questions > 0 ? (
                <TagDeleteButton
                  id={tag.id}
                  disabled
                  onDeleted={() => setShowToast(true)}
                />
              ) : (
                <TagDeleteButton
                  id={tag.id}
                  onDeleted={() => setShowToast(true)}
                />
              )}
            </Card>
          ))
        )}
      </div>

      {showToast && (
        <Toast
          message="标签已删除"
          type="success"
          onClose={() => setShowToast(false)}
        />
      )}
    </>
  );
}
