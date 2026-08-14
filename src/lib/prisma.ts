import { PrismaClient } from '@prisma/client'

// 官方推荐的 Prisma Client 单例写法（Next.js 专用）。
// 开发模式下 Next.js 会在保存文件时热重载代码，若每次都 new PrismaClient()
// 会不断新建数据库连接直到耗尽上限。把实例挂到 globalThis 上，热重载时复用同一个。
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
