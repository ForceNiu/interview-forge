// 种子脚本：插入标签 + 15 道面试题（可重复运行，先清后插）
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 标签：name 唯一，color 决定前端展示颜色
const tags = [
  { name: 'JavaScript', color: '#F7DF1E' },
  { name: 'TypeScript', color: '#3178C6' },
  { name: 'React', color: '#61DAFB' },
  { name: 'CSS', color: '#264DE4' },
  { name: '浏览器', color: '#E65100' },
  { name: '网络', color: '#0F9D58' },
];

// 15 道面试题。注意每个字段对应 Question 表的一列：
//   title      题目
//   content    Markdown 正文
//   difficulty 难度 1-5
//   source     来源
//   tags       关联标签名数组（写入 QuestionTag 中间表）
const questions = [
  {
    title: 'useEffect 的依赖数组有什么作用？',
    content: '依赖数组决定副作用函数多久执行一次：空数组只在挂载时执行一次；[a] 在 a 变化时执行；不写则每次渲染都执行。',
    difficulty: 3,
    source: 'manual',
    tags: ['React'],
  },
  {
    title: 'React 受控组件和非受控组件的区别？',
    content: '受控组件的值由 state 通过 value + onChange 控制；非受控组件直接用 ref 读取 DOM。表单优先用受控。',
    difficulty: 3,
    source: 'manual',
    tags: ['React'],
  },
  {
    title: 'useState 和 useRef 的区别？',
    content: 'useState 变化会触发重渲染；useRef 存的值变化不会触发重渲染，适合存 DOM 引用或定时器 id。',
    difficulty: 4,
    source: 'manual',
    tags: ['React'],
  },
  {
    title: '虚拟 DOM 和 Diff 算法是什么？',
    content: '虚拟 DOM 是真实 DOM 的 JS 描述；Diff 算法对比新旧虚拟 DOM，只把变化的部分更新到真实 DOM，减少直接操作 DOM 的开销。',
    difficulty: 4,
    source: 'manual',
    tags: ['React'],
  },
  {
    title: '列表渲染时 key 有什么作用？',
    content: 'key 帮助 React 识别哪些元素变了、新增或删除，从而精准更新 DOM。不要用数组下标当 key，排序/删除时会出现 bug。',
    difficulty: 3,
    source: 'manual',
    tags: ['React'],
  },
  {
    title: 'TypeScript 里 interface 和 type 的区别？',
    content: 'interface 只能描述对象/类结构，支持声明合并；type 可以为任意类型起别名，支持联合/交叉类型。多数对象场景两者都可。',
    difficulty: 3,
    source: 'manual',
    tags: ['TypeScript'],
  },
  {
    title: 'TypeScript 泛型在什么场景下使用？',
    content: '当函数/组件需要处理多种类型但要保持类型关联时用泛型，例如 identity<T>(v: T): T，避免 any 丢失类型信息。',
    difficulty: 4,
    source: 'manual',
    tags: ['TypeScript'],
  },
  {
    title: '事件循环 Event Loop 与宏任务、微任务？',
    content: 'JS 单线程，同步代码先执行，然后清空微任务队列（Promise），再取一个宏任务（setTimeout）执行，循环往复。',
    difficulty: 5,
    source: 'manual',
    tags: ['JavaScript'],
  },
  {
    title: '什么是闭包？有什么实际应用？',
    content: '函数和其词法环境的组合。应用：防抖节流、模块私有变量、React 自定义 Hook 保存状态。',
    difficulty: 4,
    source: 'manual',
    tags: ['JavaScript'],
  },
  {
    title: 'this 的指向规则是什么？',
    content: '默认绑定、隐式绑定（谁调用指向谁）、显式绑定（call/apply/bind）、new 绑定。箭头函数没有自己的 this，继承外层。',
    difficulty: 4,
    source: 'manual',
    tags: ['JavaScript'],
  },
  {
    title: '防抖和节流的区别？',
    content: '防抖：触发后等待一段时间再执行，期间重复触发会重置计时（搜索输入）；节流：固定时间间隔内只执行一次（滚动/resize）。',
    difficulty: 4,
    source: 'manual',
    tags: ['JavaScript'],
  },
  {
    title: 'CSS 盒模型与 BFC 是什么？',
    content: '盒模型 = content + padding + border + margin；box-sizing 决定 width 是否包含 padding/border。BFC 是独立渲染区域，可隔离浮动、阻止 margin 重叠。',
    difficulty: 3,
    source: 'manual',
    tags: ['CSS'],
  },
  {
    title: 'Flex 布局常见的坑有哪些？',
    content: '子元素默认会被压缩；min-width: 0 才能正常换行/截断；align-items 默认 stretch 会让子项被拉伸。',
    difficulty: 3,
    source: 'manual',
    tags: ['CSS'],
  },
  {
    title: '浏览器从输入 URL 到页面渲染的过程？',
    content: 'DNS 解析 → 建立 TCP/TLS → 发送请求 → 解析 HTML 构建 DOM → 构建 CSSOM → 合成渲染树 → 布局 → 绘制 → 合成上屏。',
    difficulty: 5,
    source: 'manual',
    tags: ['浏览器'],
  },
  {
    title: 'HTTP 缓存：强缓存与协商缓存？',
    content: '强缓存：Cache-Control / Expires，命中不发的请求；协商缓存：ETag / Last-Modified，命中返回 304。优先级强缓存高于协商缓存。',
    difficulty: 5,
    source: 'manual',
    tags: ['网络'],
  },
];

async function main() {
  // 先确保有一个用户（Question.userId 必填，关联 User 表）
  const user = await prisma.user.upsert({
    where: { email: 'demo@local.dev' },
    update: {},
    create: { email: 'demo@local.dev', name: '我' },
  });

  // 标签幂等插入（name 唯一，重复运行不会报错）
  for (const t of tags) {
    await prisma.tag.upsert({
      where: { name: t.name },
      update: { color: t.color },
      create: t,
    });
  }

  // 清空旧题目（QuestionTag 设了级联删除，会一起清掉）
  await prisma.question.deleteMany();

  // 逐条插入题目，并通过嵌套 create 写入题↔标签关联
  for (const q of questions) {
    await prisma.question.create({
      data: {
        title: q.title,
        content: q.content,
        difficulty: q.difficulty,
        source: q.source,
        userId: user.id,
        tags: {
          create: q.tags.map((name) => ({ tag: { connect: { name } } })),
        },
      },
    });
  }

  const count = await prisma.question.count();
  console.log('✅ 种子完成，题库现有', count, '道题');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ 种子失败:', e.message);
  process.exit(1);
});
