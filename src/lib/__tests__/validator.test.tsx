import { test, expect } from '@jest/globals';
import {
  questionSchema,
  formatZodError,
  validateQuestionSemantics,
  validateTotalCount,
} from '@/lib/validator';

test('formatZodError 按字段路径平铺 issues', () => {
  const parsed = questionSchema.safeParse({ title: '', content: '', difficulty: '9' });
  expect(parsed.success).toBe(false);
  const fe = formatZodError((parsed as any).error);
  expect(fe.title).toBeDefined();
  expect(fe.difficulty).toBeDefined();
});

test('validateQuestionSemantics 标出 内容过短 / 缺标签 / 不相关', () => {
  const issues = validateQuestionSemantics(
    { title: 'x', content: '短', difficulty: 3, tags: [] },
    { primaryStack: 'React', skills: ['Vue'], resumeText: '' }
  );
  expect(issues.some((i) => i.includes('内容过短'))).toBe(true);
  expect(issues.some((i) => i.includes('缺少知识域标签'))).toBe(true);
  expect(issues.some((i) => i.includes('相关性'))).toBe(true);
});

test('validateTotalCount 限定 8-10', () => {
  expect(validateTotalCount({ domains: [{ count: 5 }, { count: 5 }] })).toEqual([]);
  expect(validateTotalCount({ domains: [{ count: 1 }] }).length).toBeGreaterThan(0);
  expect(validateTotalCount({ domains: [{ count: 10 }, { count: 1 }] }).length).toBeGreaterThan(0);
});
