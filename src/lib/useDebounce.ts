"use client";

import { useEffect, useState } from "react";

// 防抖 hook：value 变化后等待 delay 毫秒，才把"稳定值"返回出去。
// 用途：搜索框里用户连续打字时，不每次击键都触发后端请求，
// 而是停下 typing 满 delay 后才生效（本项目用 300ms），减少无谓请求。
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    // 值再次变化前清掉上一个定时器，避免"还没到 300ms 又输入"时提前触发
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
