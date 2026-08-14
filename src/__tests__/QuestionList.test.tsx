// 列表渲染测试
//
// 说明：计划（项目总体规划 Day 13）把这份测试命名为 QuestionList.test.tsx，
// 对应「渲染列表 → 验证卡片数量和内容」。项目里实际渲染列表的组件是
// SearchableQuestions（首页搜索组件，Client Component，数据由 Server Component 经 props 传入），
// 所以这里直接测它。
import { test, expect, jest } from '@jest/globals';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SearchableQuestions from '@/app/SearchableQuestions';

// ① 造假三个子组件，隔离「列表自身」的渲染与过滤逻辑，
//    不真删库、不真调 TanStack Query（FavoriteButton 内部有 useMutation）。
jest.mock('@/components/DeleteButton', () => ({
  __esModule: true,
  default: ({ onDeleted }: any) => (
    <button onClick={() => onDeleted({ id: 'x' })}>删除</button>
  ),
}));
jest.mock('@/components/FavoriteButton', () => ({
  __esModule: true,
  default: () => <button>收藏</button>,
}));
jest.mock('@/components/Toast', () => ({
  __esModule: true,
  default: ({ message }: any) => <div>{message}</div>,
}));

// ①（续）造假「后端搜索」Server Action：测试环境不连真库、也不加载 next/cache 的服务器内部，
//    用一份本地数据模拟"连库模糊查 标题+正文"，断言组件确实把搜索委托给了后端。
//    注意：mock 数据放在 factory 内部（data），避免引用外部变量触发 jest hoist 的 TDZ 问题。
jest.mock('@/actions/questions', () => {
  const data = [
    {
      id: '1',
      title: 'React Hooks 用法',
      difficulty: 2,
      favorite: false,
      content: 'useState 与 useEffect 的基本用法',
      tags: [{ tag: { id: 't1', name: 'React', color: '#6366f1' } }],
    },
    {
      id: '2',
      title: '闭包与作用域',
      difficulty: 4,
      favorite: false,
      content: '词法作用域与变量提升',
      tags: [],
    },
  ];
  return {
    searchQuestions: jest.fn(async (q: string) =>
      data.filter(
        (m) =>
          m.title.toLowerCase().includes(String(q).toLowerCase()) ||
          (m.content ?? '').toLowerCase().includes(String(q).toLowerCase())
      )
    ),
  };
});

// ② 两条测试数据，形状对齐 Prisma QuestionGetPayload（include tags.tag）
//    （用于传给组件的 SSR 首屏 questions 属性；与上面 mock 的 data 形状一致）
const mockQuestions = [
  {
    id: '1',
    title: 'React Hooks 用法',
    difficulty: 2,
    favorite: false,
    tags: [{ tag: { id: 't1', name: 'React', color: '#6366f1' } }],
  },
  {
    id: '2',
    title: '闭包与作用域',
    difficulty: 4,
    favorite: false,
    tags: [],
  },
];

test('渲染列表时，每张题目卡片都显示标题', () => {
  render(<SearchableQuestions questions={mockQuestions as any} />);
  expect(screen.getByText('React Hooks 用法')).toBeInTheDocument();
  expect(screen.getByText('闭包与作用域')).toBeInTheDocument();
});

test('搜索框输入关键词后，调用后端搜索并只显示匹配的卡片', async () => {
  render(<SearchableQuestions questions={mockQuestions as any} />);

  // 初始两条都在
  expect(screen.getByText('React Hooks 用法')).toBeInTheDocument();
  expect(screen.getByText('闭包与作用域')).toBeInTheDocument();

  // 输入 "React"：搜索现在是「防抖 + 后端 Server Action」，异步返回，用 waitFor 等结果
  fireEvent.change(
    screen.getByPlaceholderText('搜索题目（标题或正文）...'),
    { target: { value: 'React' } }
  );

  // 后端结果回来后：匹配项仍在，不匹配项消失（数据来自 mock 的 searchQuestions）
  await waitFor(() => {
    expect(screen.getByText('React Hooks 用法')).toBeInTheDocument();
    expect(screen.queryByText('闭包与作用域')).not.toBeInTheDocument();
  });
});
