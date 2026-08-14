"use client";
// ↑ 需要 useRouter（浏览器跳转），必须 "use client"

import Link from "next/link";
import { useRouter } from "next/navigation";
import DeleteButton from "@/components/DeleteButton";
import { Button } from "@/components/ui/button";

// 详情页的操作区：编辑 + 删除。
// 放在客户端组件里，是因为删除成功后要 router.push 跳回首页（带 toast 参数）。
export default function DetailActions({ id }: { id: string }) {
  const router = useRouter();

  return (
    <div className="mt-6 flex items-center gap-3">
      <Button asChild size="sm">
        <Link href={`/questions/${id}/edit`}>编辑</Link>
      </Button>
      {/* 删成功后：跳回首页，并带上 ?toast= 让全局 Toast 弹"题目已删除" */}
      <DeleteButton
        id={id}
        onDeleted={() =>
          router.push(`/?toast=${encodeURIComponent("题目已删除")}`)
        }
      />
    </div>
  );
}
