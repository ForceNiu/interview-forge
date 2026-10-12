# Interview Forge · 项目规则

## 这是什么
全栈面试题库管理平台：题库 CRUD + AI 智能出题。技术栈 Next 16 App Router / React 19 / TypeScript / Prisma / PostgreSQL / Tailwind v4 / LangGraph。

## 命令（照抄即可，不要猜变体）
- 装依赖：npm install
- 开发：npm run dev
- 测试：npm test（注意是 type-check 不是 typecheck，这条命令名不规则）
- 类型检查：npm run type-check
- 代码检查：npm run lint
- 构建：npm run build

## CI 四道门禁（顺序固定，勿改顺序）
lint → type-check → test → build
任何一道不过就不能合并。改代码后本地跑一遍这四道再提交。

## 红线（违反需先问）
- 禁止修改 prisma/migrations/ 下已提交的迁移文件，只允许新建迁移
- 禁止删除或改写 prisma/schema.prisma 里已有字段的语义；加字段要给默认值
- 禁止把 API Key、数据库连接串写进源码或任何会被提交的文件
- 禁止引入新的依赖而不先说明理由

## 代码约定
- 新增代码禁止使用 any；类型不确定时用 unknown 加类型守卫。ESLint 规则见 eslint.config.mjs
- 注释写「为什么」不写「复述代码」
- 面向用户的文案用中文

## 架构要点
- src/lib/ai/workflow.ts 是 LangGraph 出题工作流，5 个节点；MAX_REFINE_ROUNDS=2 是硬上限，不要调大
- 出题结果必须经 src/lib/validator.ts 的确定性规则校验，不靠 LLM 自评
- 每次出题留痕写 GenerationRun 表（见 prisma/schema.prisma），这是可观测性用的

## 提交前自检
- 四道门禁本地全绿
- git status 里没有意外的新文件（AI 工具可能留下临时文件残留）
- 改动只碰了该碰的文件

## 本地与 CI 的差异
- CI 的四个 job（lint / type-check / test / build）都先跑 npx prisma generate；本地 npm test 不会自动跑。所以本地报Prisma 类型不存在时，先手动跑 npx prisma generate。
- package.json 没有 engines 字段，但 CI 固定 Node 22。本地版本不一致可能引发与代码无关的失败。
- 因此：本地四道全绿 ≠ CI 全绿。看 GitHub 上的绿勾前，先确认这次真的跑了 run，别把上次的残留当成通过。

## 本文件怎么维护
- 改完本文件后用固定问题验证注入是否生效：跑 claude -p "只回答X、Y、Z，不要读文件" --permission-mode plan --allowed-tools none，它答不上来就说明规则写歪了。
- 加新规则前过三问：这个错误在本项目发生过吗 / 不写的话 AI 会做什么具体错误动作 / 这条规则换个项目还成立吗。三个都过才加。
- 已知问题：用 Claude Code 改文件后可能残留 .tmp 临时文件且它不会主动提示，提交前必须看 git status。
- 人的信息（某条规则为什么存在、哪次故障驱动它加的）写进代码注释或提交信息，不要混进本文件——AI 不读这些，反而占上下文。
