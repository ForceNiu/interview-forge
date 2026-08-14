// 难度（1-5）的统一表示：标签文案 + 语义色 token
// 三处显示（列表 / 详情 / AI 出题审核）都走这里，避免配色与文案各写一套、改一处漏两处。
// 颜色用 globals.css 里的 --diff-1/2/3 token（深浅模式自动联动），不再硬编码十六进制。

const DIFFICULTY_LABELS = ["", "入门", "简单", "中等", "较难", "困难"];

/** 难度数字 → 中文标签（1-5）。越界或缺失默认「中等」。 */
export function difficultyLabel(d: number): string {
  return DIFFICULTY_LABELS[d] ?? DIFFICULTY_LABELS[3];
}

/** 难度数字 → 语义色（hsl 三参以逗号分隔，因此把 CSS 变量里空格换成逗号）。1-2 苔绿 / 3 赭黄 / 4-5 砖红。 */
export function difficultyColor(d: number): string {
  if (d <= 2) return "hsl(var(--diff-1))".replace(/ /g, ",");
  if (d === 3) return "hsl(var(--diff-2))".replace(/ /g, ",");
  return "hsl(var(--diff-3))".replace(/ /g, ",");
}
