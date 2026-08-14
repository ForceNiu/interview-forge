import { test, expect, jest, beforeEach } from '@jest/globals';
import { PATCH } from '@/app/api/questions/[id]/favorite/route';

// 隔离数据库
jest.mock('@/lib/prisma', () => ({
  prisma: { question: { findUnique: jest.fn(), update: jest.fn() } },
}));
// 真实 next/server 在 jsdom 下会因缺少全局 Request 而加载失败，这里只 mock 用到的 json
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: any) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

import { prisma } from '@/lib/prisma';

beforeEach(() => {
  jest.clearAllMocks();
});

test('PATCH 切换收藏：未收藏 → 已收藏', async () => {
  (prisma.question.findUnique as jest.Mock<any>).mockResolvedValueOnce({ id: '1', favorite: false });
  (prisma.question.update as jest.Mock<any>).mockResolvedValueOnce({ id: '1', favorite: true });
  const res = await PATCH({} as any, { params: Promise.resolve({ id: '1' }) });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.favorite).toBe(true);
  expect(prisma.question.update).toHaveBeenCalledWith({
    where: { id: '1' },
    data: { favorite: true },
  });
});

test('PATCH 题目不存在返回 404，不更新', async () => {
  (prisma.question.findUnique as jest.Mock<any>).mockResolvedValueOnce(null);
  const res = await PATCH({} as any, { params: Promise.resolve({ id: '9' }) });
  expect(res.status).toBe(404);
  expect(prisma.question.update).not.toHaveBeenCalled();
});
