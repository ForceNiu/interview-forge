import { test, expect, jest, beforeEach } from '@jest/globals';
import { searchQuestions, createQuestion } from '@/actions/questions';

// 隔离数据库：所有 prisma 方法都换成 jest.fn，测试不连真库（独立 Neon 库）
jest.mock('@/lib/prisma', () => ({
  prisma: {
    question: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    tag: { create: jest.fn(), delete: jest.fn() },
    user: { findFirst: jest.fn(), create: jest.fn() },
  },
}));
// next/cache 在服务端才存在，测试里 mock 掉（createQuestion 成功路径会调 revalidatePath）
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { prisma } from '@/lib/prisma';

beforeEach(() => {
  jest.clearAllMocks();
});

test('searchQuestions 空查询直接返回 []，不查库', async () => {
  const r = await searchQuestions('   ');
  expect(r).toEqual([]);
  expect(prisma.question.findMany).not.toHaveBeenCalled();
});

test('searchQuestions 的 OR 条件同时覆盖 标题 / 正文 / 标签名', async () => {
  const fm = prisma.question.findMany as jest.Mock<any>;
  fm.mockResolvedValueOnce([]);
  await searchQuestions('网络');
  const arg = fm.mock.calls[0][0] as any;
  expect(arg).toEqual(
    expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { title: { contains: '网络', mode: 'insensitive' } },
          { content: { contains: '网络', mode: 'insensitive' } },
          { tags: { some: { tag: { name: { contains: '网络', mode: 'insensitive' } } } } },
        ]),
      }),
    })
  );
});

test('createQuestion 标题为空时返回字段级错误，不写库', async () => {
  const fd = new FormData();
  fd.set('title', '   ');
  fd.set('content', '一些内容');
  fd.set('difficulty', '3');
  const res = await createQuestion({ error: null }, fd);
  expect(res.fieldErrors).toBeDefined();
  expect(res.fieldErrors!.title).toBeDefined();
  expect(prisma.question.create).not.toHaveBeenCalled();
});
