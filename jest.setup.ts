// 裁判词汇表：让 Jest 认识 UI 专用判断词
// 例如 expect(元素).toBeInTheDocument() / toBeVisible() / toHaveTextContent()
// 用 jest-globals 入口：项目测试文件从 @jest/globals 导入 test/expect/jest，
// 这个入口能把 toBeInTheDocument 等断言词的类型和运行时都接到 @jest/globals 的 expect 上。
import '@testing-library/jest-dom/jest-globals';

// jsdom 环境缺 TextEncoder/TextDecoder 全局（部分 Next 内部模块会用到）。
// 渲染时会间接 import next/cache（revalidatePath），其依赖链需要这两个全局，
// 生产/真实浏览器里自带，仅测试环境需补；否则报 "TextEncoder is not defined"。
import { TextEncoder, TextDecoder } from 'util';

interface TestGlobals {
  TextEncoder?: typeof TextEncoder;
  TextDecoder?: typeof TextDecoder;
}
const g = globalThis as unknown as TestGlobals;

if (typeof g.TextEncoder === 'undefined') {
  g.TextEncoder = TextEncoder;
}
if (typeof g.TextDecoder === 'undefined') {
  g.TextDecoder = TextDecoder;
}
