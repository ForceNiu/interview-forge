import { test, expect } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { stripMarkdown, getSnippet, highlight } from '@/lib/search-ui';

test('stripMarkdown 去掉标题/粗体/行内代码/引用/链接标记，URL 去掉、文字保留', () => {
  const md = '# 标题\n这是 **粗体** 和 `代码`\n> 引用\n[链接](https://x.com)';
  const out = stripMarkdown(md);
  expect(out).not.toMatch(/[#*`>]/);
  expect(out).toContain('标题');
  expect(out).toContain('粗体');
  expect(out).toContain('代码');
  expect(out).toContain('链接');
  expect(out).not.toContain('https://x.com');
});

test('getSnippet 命中时以命中处为中心截取并加省略号', () => {
  const content = '前'.repeat(80) + 'KEYWORD' + '后'.repeat(100);
  const s = getSnippet(content, 'KEYWORD');
  expect(s).toContain('KEYWORD');
  expect(s.startsWith('…')).toBe(true);
  expect(s.endsWith('…')).toBe(true);
});

test('getSnippet 未命中时取开头 len 字', () => {
  expect(getSnippet('abcdefghij', 'zzz', 5)).toBe('abcde');
});

test('highlight 大小写不敏感地把命中词包进 <mark>', () => {
  const html = renderToStaticMarkup(<>{highlight('Hello World', 'world')}</>);
  expect(html).toContain('<mark');
  expect(html).toContain('World');
  expect(html).toContain('Hello');
});

test('highlight 查询为空时返回原文本、无 <mark>', () => {
  const html = renderToStaticMarkup(<>{highlight('Hello World', '  ')}</>);
  expect(html).not.toContain('<mark');
  expect(html).toContain('Hello World');
});

test('highlight 查询含正则特殊字符也不报错', () => {
  const html = renderToStaticMarkup(<>{highlight('a.b.c', '.')}</>);
  expect(html).toContain('<mark');
});
