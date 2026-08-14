import { test, expect, jest, beforeEach } from '@jest/globals';
import { createTag } from '@/actions/tags';

jest.mock('@/lib/prisma', () => ({
  prisma: { tag: { create: jest.fn(), delete: jest.fn() } },
}));
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }));

import { prisma } from '@/lib/prisma';

beforeEach(() => {
  jest.clearAllMocks();
});

test('createTag 名称为空返回错误，不写库', async () => {
  const fd = new FormData();
  fd.set('name', '   ');
  const res = await createTag({ error: null }, fd);
  expect(res.error).toBe('标签名不能为空');
  expect(prisma.tag.create).not.toHaveBeenCalled();
});

test('createTag 唯一约束冲突返回“已存在”错误', async () => {
  (prisma.tag.create as jest.Mock<any>).mockRejectedValueOnce(new Error('unique violation'));
  const fd = new FormData();
  fd.set('name', 'React');
  const res = await createTag({ error: null }, fd);
  expect(res.error).toBe('标签名已存在');
});
