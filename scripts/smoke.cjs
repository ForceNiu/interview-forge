require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tags = await prisma.tag.findMany();
  console.log('✅ 连接成功，tag 表当前行数:', tags.length);
  const qCount = await prisma.question.count();
  console.log('✅ question 表当前行数:', qCount);
  await prisma.$disconnect();
}
main().catch((e) => { console.error('❌ 运行出错:', e.message); process.exit(1); });
