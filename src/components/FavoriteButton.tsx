"use client";
// 星标按钮：点一下立刻变亮（乐观更新 optimistic），后台写库，失败回滚。

import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  id: string;
  initialFavorite: boolean;
  // 切换成功后通知父组件（/favorites 页用它来 invalidate 查询缓存）
  onToggled?: () => void;
};

function FavoriteButton({ id, initialFavorite, onToggled }: Props) {
  const router = useRouter();

  // 本地镜像：初始值 = 服务器给的 favorite
  const [isFav, setIsFav] = useState(initialFavorite);
  // 回滚点：点之前把当前值存进 ref
  const prevRef = useRef(initialFavorite);

  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/questions/${id}/favorite`, { method: "PATCH" }).then((res) => {
        if (!res.ok) throw new Error("切换失败");
        return res.json();
      }),
    onError: () => setIsFav(prevRef.current),
    onSuccess: () => {
      router.refresh();
      onToggled?.();
    },
  });

  function handleClick() {
    prevRef.current = isFav; // ① 快照
    setIsFav(!isFav); // ② 乐观翻面：UI 先行，不等服务器
    mutation.mutate(); // ③ 后台写库
  }

  return (
    <Button
      type="button"
      variant={isFav ? "default" : "outline"}
      size="sm"
      onClick={handleClick}
      disabled={mutation.isPending}
      aria-pressed={isFav}
    >
      <Star className={isFav ? "fill-current" : ""} />
      {isFav ? "已收藏" : "收藏"}
    </Button>
  );
}

// React Compiler 自动 memoize，无需手动包 memo
export default FavoriteButton;
