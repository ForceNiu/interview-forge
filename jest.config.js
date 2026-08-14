/**
 * Jest 总说明书
 * 作用：告诉 Jest 引擎去哪跑测试、怎么翻译 TS 代码、@/ 别名映射到哪、开工前准备啥
 */
module.exports = {
  // ① 考场：用内存假浏览器（jsdom）渲染 React 组件，不真开浏览器
  testEnvironment: 'jsdom',

  // ② 开工前准备文件：注册 jest-dom 的 UI 判断词（toBeInTheDocument 等）
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // ③ 路径别名翻译：把 @/ 开头的导入映射到 src/ 下，否则 Jest 找不到文件
  //    对应 tsconfig.json 里的 "@/*": ["./src/*"]
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // ④ 翻译官：Jest 只懂 JS，用 babel-jest 把 TS/TSX 翻成 JS 再跑
  //    configFile: false 关键 —— 不让 Jest 去读项目根的 babel 配置，
  //    避免干扰 Next.js 自己的 SWC 编译（否则 next build 会被迫切回 Babel）
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': [
      'babel-jest',
      {
        configFile: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          ['@babel/preset-react', { runtime: 'automatic' }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },

  // ⑤ 找测试文件的范围：任何 *.test.tsx 都算测试
  testMatch: ['**/__tests__/**/*.test.tsx', '**/*.test.tsx'],
};
