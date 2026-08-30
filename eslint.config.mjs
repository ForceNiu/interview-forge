import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactCompiler from "eslint-plugin-react-compiler";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // React Compiler：报告编译器无法优化的不纯净组件，支持自动修复。
  // 与 next.config.ts 里的 experimental.reactCompiler 配合，保证代码可被编译器正确处理。
  {
    plugins: {
      "react-compiler": reactCompiler,
    },
    rules: {
      "react-compiler/react-compiler": "error",
    },
  },
  // 基础规则调整：下划线前缀参数表示「故意不用」，不算未使用
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // 测试 / 脚本 / setup 文件：mock 与 CJS 环境需要大量 any / require，
  // 把这些规则关掉只聚焦生产代码质量，避免测试样板噪音淹没真实问题。
  {
    files: [
      "**/*.test.{ts,tsx}",
      "jest.setup.ts",
      "scripts/*.cjs",
      "*.config.*",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
