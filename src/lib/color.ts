// 标签文字自动反色：根据背景色相对亮度，返回可读的文字颜色（深底→白字，浅底→黑字）。
// 解决 C-12：用户在数据库自建浅色标签时，原写死的 text-white 会导致「白字白底」看不见。

function relLum(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function textOn(bg: string): string {
  if (!bg || !/^#?[0-9a-fA-F]{3,8}$/.test(bg)) return "#1b1b1b";
  const lum = relLum(bg.startsWith("#") ? bg : "#" + bg);
  return lum > 0.5 ? "#1b1b1b" : "#ffffff";
}
