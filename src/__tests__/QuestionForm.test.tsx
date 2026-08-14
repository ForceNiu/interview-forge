// 单元5：给 QuestionForm 写第一个「真实」测试
// （不是冒烟测试，是验证它真的渲染出了该有的字段和按钮）

// Jest 30 的全局函数（test / expect / jest）不再是 ambient（全局自动识别），
// 必须在测试文件里显式从 @jest/globals 导入，TypeScript 才认得它们。
import { test, expect, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionForm from '@/components/QuestionForm';

// ① 造假（mock）useRouter —— 本轮唯一的新知识点
//    组件第 31 行 `const router = useRouter()` 在「渲染时」就会执行。
//    但测试环境（jsdom）里没有 Next.js 的真实路由上下文，
//    真实的 useRouter() 在这里返回不了东西，一调用就崩。
//    所以我们用 jest.mock 把 next/navigation 的导出整个替成一个「假 router」：
//    只要它身上有个 push 方法（且是个 jest.fn，将来能断言「跳没跳转」）就够用了。
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// ② 造假 action：组件要求外部传一个 Server Action 函数（新增/编辑传不同的）。
//    测试不真的提交表单，所以给一个「永远返回 { error: null }」的空函数即可。
//    （组件初始 state 是 { error: null }，没有 ok 字段 → 跳转用的 useEffect 不会触发）
const fakeAction = async () => ({ error: null });

test('渲染出题目 / 答案 / 难度 三个字段和提交按钮', () => {
  // ③ 把组件渲染进 jsdom 这个「内存假浏览器」
  render(
    <QuestionForm
      action={fakeAction}
      submitLabel="保存"
      successHref="/questions"
      successText="保存成功"
    />
  );

  // ④ RTL 渲染后，用 screen 在「页面」里按文字找元素
  //    jest-dom 的 toBeInTheDocument() = 「这个元素真的在页面上吗」
  expect(screen.getByText('题目')).toBeInTheDocument();
  expect(screen.getByText('答案（Markdown）')).toBeInTheDocument();
  expect(screen.getByText('难度')).toBeInTheDocument();

  // 按钮文字由 submitLabel 决定，这里应该是「保存」
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument();
});

// 单元5（续）：交互测试（interaction test）—— 这才是测试「真实价值」的体现
//   第一个测试只证明「页面长这样」；这个测试证明「用户填表、点保存，
//   提交函数真的被调用、且输入框里的值真的送到了提交函数手里」。
//   这类测试的真实意义：以后谁手滑删了提交 wiring（接线）、或把字段 name 改错，
//   测试立刻变红报警，不用等上线才被发现。
test('填写表单并点击保存后，提交函数被调用且拿到输入值', async () => {
  const user = userEvent.setup();

  // 这次的假 action 用 jest.fn 包起来 —— jest.fn 能帮我们「盯」它被没被调用、被怎么调用
  // 签名照抄组件要求的 (prevState, formData)，我们只关心第 2 个参数 formData
  const submitAction = jest.fn(async (_prev: unknown, _formData: FormData) => ({
    error: null,
  }));

  render(
    <QuestionForm
      action={submitAction}
      submitLabel="保存"
      successHref="/questions"
      successText="保存成功"
    />
  );

  // ① 模拟用户一步步填表（userEvent.type = 真人在输入框打字）
  await user.type(screen.getByLabelText('题目'), 'React 的 useEffect 用法');
  await user.type(screen.getByLabelText('答案（Markdown）'), '在浏览器绘制后异步执行');

  // ② 模拟用户点击「保存」按钮（type="submit" → 触发 form 的提交）
  await user.click(screen.getByRole('button', { name: '保存' }));

  // ③ 断言：提交函数确实被调用了（waitFor 等异步的 action 跑完）
  await waitFor(() => expect(submitAction).toHaveBeenCalled());

  // ④ 更进一步：取出提交时收到的 FormData，确认「题目」字段的值真的传进去了
  const [, formData] = submitAction.mock.calls[0];
  expect(formData.get('title')).toBe('React 的 useEffect 用法');
});

// TG-2 补全测试：标签多选区真的把勾选的标签 id 作为隐藏字段提交
test('点击标签 chip 后，选中的标签 id 以隐藏 tagIds 字段存在', async () => {
  const user = userEvent.setup();
  const tags = [
    { id: 't1', name: 'React', color: '#ff0000' },
    { id: 't2', name: 'Vue', color: '#00ff00' },
    { id: 't3', name: 'Node', color: '#0000ff' },
  ];

  render(
    <QuestionForm
      action={fakeAction}
      availableTags={tags}
      submitLabel="保存"
      successHref="/questions"
      successText="保存成功"
    />
  );

  // 标签多选区应渲染出来
  expect(screen.getByText('标签（可多选）')).toBeInTheDocument();

  // 模拟用户点选 React 和 Node（不点 Vue）
  await user.click(screen.getByRole('button', { name: 'React' }));
  await user.click(screen.getByRole('button', { name: 'Node' }));

  // 断言：表单里出现 2 个 name="tagIds" 的隐藏 input，值分别为 t1 / t3
  const hidden = document.querySelectorAll('input[type="hidden"][name="tagIds"]');
  expect(hidden.length).toBe(2);
  expect(hidden[0].getAttribute('value')).toBe('t1');
  expect(hidden[1].getAttribute('value')).toBe('t3');
});
