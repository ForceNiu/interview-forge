import { StateGraph, Annotation, END, START } from "@langchain/langgraph";
import { SystemMessage } from "@langchain/core/messages";
import { createLLM } from "./client";
import { makeRunId, appendLog, type LogLine } from "./logger";
import { generatedQuestionSchema, validateQuestionSemantics, resumeAnalysisSchema, strategySchema, validateDomainDepthConsistency, validateTotalCount } from "@/lib/validator";

// 重试与超时参数（集中放一处，方便统一调）
// MAX_ATTEMPTS：每个节点/每个域最多重试次数（节点①③④ 均为手写 for 循环 + lastErr 错误回灌重试，非框架 retryPolicy；节点② 纯函数无重试）
const MAX_ATTEMPTS = 3;
// NODE_TIMEOUT_MS：单次调用的墙钟上限（毫秒）。超时即中止请求并重试
// 注意：经代理隧道出网 + DeepSeek 生成大段 JSON，单次调用实测 14~30s；
// 节点④（generateQuestions）以 5 路并发跑 10 个知识域、外加重试 + 精炼环，总窗口常达 60~120s，
// 故放宽到 300000（5 分钟）避免节点级超时误杀正常慢调用（客户端 client.ts 另有 300s 兜底）。
// 注：截图重跑时发现 DeepSeek 在当天多次重请求后被限速、单次响应变慢（>3min），临时提到 5min 让慢响应也能跑完。
const NODE_TIMEOUT_MS = 300000;
// MAX_REFINE_ROUNDS：精炼环最多重出几轮（硬上限，保证必终止、不撞 Vercel 300s）
const MAX_REFINE_ROUNDS = 2;

// 单次调用的墙钟超时：超时即中止底层请求（AbortController），交上层决定是否重试
async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  externalSignal?: AbortSignal
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // 合并「调用超时」与「用户取消」两种信号：任一触发即中断本次 LLM 调用
  const combined = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;
  try {
    return await run(combined);
  } finally {
    clearTimeout(timer);
  }
}

// 限并发执行：并发数最初设为 3 路，是**保守默认值**（担心 DeepSeek 速率限制 / RPM 上限）。
// 但 2026-08-13 多配置实测（5 轮 × 9 域、间隔 2–3 分钟、共 225 次调用）表明：
// 全程**零 429**，且 limit=5 为实测最优（≈10.8s、相对串行约 3.8x 提速；limit=8 仍≈10s 但边际收益递减）。
// 故将生产值定为 5 路——既吃满提速、又留安全余量（实测 10 路仍零 429，但 5 路已近收益天花板、更稳）。
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

// ============================================================
// 来自 mock-interview skill 的知识域分类体系
// ============================================================
const SKILL_CATEGORIES = [
  "js-basic",      // JavaScript 基础：闭包/原型链/事件循环/Promise/this/作用域
  "css",           // CSS：布局/盒模型/层叠上下文/动画/响应式
  "browser",       // 浏览器：渲染机制/重排重绘/缓存/安全/存储
  "vue",           // Vue：响应式原理/组件通信/Vuex-Pinia/生命周期/虚拟DOM
  "react",         // React：Hooks/Fiber/状态管理/渲染优化/SSR
  "engineering",   // 工程化：Webpack/Vite/CI-CD/包管理/代码规范
  "network",       // 网络：HTTP/HTTPS/TCP/WebSocket/跨域/缓存策略
  "performance",   // 性能优化：加载优化/运行时优化/监控/Core Web Vitals
  "electron",      // Electron：主进程渲染进程/IPC/打包/自动更新
  "typescript",    // TypeScript：类型系统/泛型/工具类型/声明文件
] as const;

// ============================================================
// 自定义状态类型
// ============================================================

interface ResumeAnalysis {
  primaryStack: string;
  skills: string[];
  skillCategoryMap: Record<string, string[]>;  // { "vue": ["Vue3", "Pinia"], "engineering": ["Webpack", "Vite"] }
  domainDepth: Record<string, "deep" | "medium" | "gap">; // 每个技能域的深度，驱动节点③确定性映射三层
  projects: { name: string; tech: string[]; depth: "deep" | "medium" }[];
  overallLevel: "junior" | "mid" | "senior" | "staff";
  highlights: string[];      // 亮点（项目中有量化成果、深度经验）
  blindSpots: string[];      // 简历中未提及但该级别应该掌握的点（来自 skill 分类体系的对照）
}

interface QuestionStrategy {
  domains: {
    name: string;
    category: string;        // 归入哪个知识域分类，如 "vue"、"engineering"
    depth: "deep" | "medium" | "gap";
    questionType: "project-deep-dive" | "concept" | "gap-fill";
    count: number;
    reasoning: string;
  }[];
}

// ============================================================
// 路由分流决策（确定性分类器，零 LLM 调用）
// 为何用纯函数而非再调一次 LLM：输入(analysis)已是结构化对象、需要同输入必同输出(可控可复现)、
// 省一次 token 往返、且避免 LLM 分类漂移/幻觉。本质是「把需可控的环节从 LLM 手里拿回确定性代码」。
// ============================================================
interface RoutingDecision {
  level: ResumeAnalysis["overallLevel"]; // 复用 ① 算好的水平，不重算
  targetRole: "frontend" | "fullstack";  // 含后端技能 → fullstack，否则 frontend
  hasBlindSpots: boolean;                // 是否有技能缺口（有 → 节点③ 至少出一道补缺题）
  bias: {
    concept: number;  // 基础概念题权重（适合 depth=medium 域）
    deepDive: number; // 原理深挖 / 项目追问权重（适合 depth=deep 域）
  };
}

// 后端技能关键词（命中即判定 targetRole=fullstack）。覆盖中英文常见写法。
const BACKEND_KEYWORDS = [
  "node", "java", "python", "go", "golang", "spring", "php", "ruby", "c++", "c#",
  "kafka", "mysql", "postgresql", "postgres", "redis", "mongodb", "docker", "k8s",
  "kubernetes", "后端", "服务端", "server",
];

// 纯函数：把 ① 的结构化 analysis → 路由决策。无副作用、可单测、可复现。
function computeRouting(analysis: ResumeAnalysis): RoutingDecision {
  const level = analysis.overallLevel;
  const haystack = `${analysis.primaryStack} ${analysis.skills.join(" ")}`.toLowerCase();
  const hasBackend = BACKEND_KEYWORDS.some((k) => haystack.includes(k));
  const targetRole: RoutingDecision["targetRole"] = hasBackend ? "fullstack" : "frontend";

  // 水平 → 题型基础权重：越资深越偏原理深挖/项目追问，越初级越偏基础概念。
  // 补缺题的决定权交给节点③——它已有盲区清单，能根据缺口数量自主安排。
  const baseBias = {
    junior: { concept: 0.75, deepDive: 0.25 },
    mid:    { concept: 0.50, deepDive: 0.50 },
    senior: { concept: 0.29, deepDive: 0.71 },
    staff:  { concept: 0.20, deepDive: 0.80 },
  }[level] ?? { concept: 0.50, deepDive: 0.50 };

  const hasBlindSpots = analysis.blindSpots.length > 0;

  return { level, targetRole, hasBlindSpots, bias: { concept: baseBias.concept, deepDive: baseBias.deepDive } };
}

interface GeneratedQuestion {
  title: string;
  content: string;
  difficulty: number;
  tags: string[];
  // 内部标记：题属于哪个知识域。仅用于 ④ 校验分组 + ④ 重出时「只换坏桶、不动好桶」（精炼环只重出失败域）。
  // 存库时被剥离（见 save-questions 路由），不会进入题库表。
  _domain?: string;
}

// ============================================================
// 同轮结构去重（② 档去重：防单次运行内产出重复题）
// 标题归一化（去空白/标点/大小写）后去重，保留首次出现者。
// 在 ④ 产出后、⑤ 校验前调用，避免重复题进入校验与落库。
// ============================================================
function normalizeTitle(t: string): string {
  return (t || "").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

function dedupeQuestions(questions: GeneratedQuestion[]): { deduped: GeneratedQuestion[]; removed: number } {
  const seen = new Set<string>();
  const deduped: GeneratedQuestion[] = [];
  for (const q of questions) {
    const key = normalizeTitle(q.title ?? "");
    if (!key || seen.has(key)) continue; // 空标题或已存在 → 跳过
    seen.add(key);
    deduped.push(q);
  }
  return { deduped, removed: questions.length - deduped.length };
}

const WorkflowState = Annotation.Root({
  resume: Annotation<string>,
  jd: Annotation<string>,
  analysis: Annotation<ResumeAnalysis | null>,
  strategy: Annotation<QuestionStrategy | null>,
  questions: Annotation<GeneratedQuestion[]>,
  // —— Day 14 可观测性 / 失败处理新增字段 ——
  failedDomains: Annotation<string[]>, // 最终失败的知识域名（调用层失败 + 精炼后仍不达标）
  callFailedDomains: Annotation<string[]>, // 调用层彻底失败的域（已重试 3 次，与语义失败区分，避免历史残留）
  logs: Annotation<LogLine[]>, // L2：本次运行的结构化日志
  runId: Annotation<string>, // 本次运行唯一 ID
  generationDone: Annotation<boolean>, // 节点④完成标记（区分"还没跑"和"跑了但 0 题"）
  // —— 精炼环（自我优化）新增字段 ——
  round: Annotation<number>, // 当前精炼轮次（0=首次生成，1+=第几轮重出）
  refineDomains: Annotation<string[]>, // 需重出的域（由 ⑤ 写入，④ 读取，决定「只重出失败域」）
  // —— 路由分流（Routing（路由分流））新增字段 ——
  routing: Annotation<RoutingDecision | null>, // ② 确定性分类结果，注入 ② 让策略偏重题型
});

// ============================================================
// 节点①：分析简历（融入 resume-skill + job-description-skill + mock-interview 分类）
// ============================================================
async function analyzeResume(state: typeof WorkflowState.State, config?: any) {
  const llm = await createLLM();
  const runId = state.runId;
  const signal = config?.configurable?.signal as AbortSignal | undefined;
  let logs = state.logs ?? [];
  logs = appendLog(runId, logs, "节点① 开始：分析简历");

  const jdSection = state.jd
    ? `\n目标岗位JD：\n${state.jd}\n请同时对比JD要求和简历内容的差距，标注为 blindSpots。`
    : "";

  const prompt = `你是一位资深前端面试官。请分析以下简历，提取关键信息并归类到前端知识域中。

前端知识域分类：
${SKILL_CATEGORIES.map(c => `- ${c}`).join("\n")}

${state.resume}${jdSection}

请以JSON格式返回（不要其他文字）：
{
  "primaryStack": "主要技术栈",
  "skills": ["技能1", "技能2", ...],
  "skillCategoryMap": {
    "js-basic": ["你从简历中识别到的JS基础相关技能"],
    "css": ["CSS相关技能"],
    "browser": ["浏览器相关技能"],
    "vue": ["Vue相关技能，如没有则写空数组"],
    "react": ["React相关技能，如没有则写空数组"],
    "engineering": ["工程化相关技能"],
    "network": ["网络相关技能"],
    "performance": ["性能优化相关技能"],
    "electron": ["Electron相关技能"],
    "typescript": ["TypeScript相关技能"]
  },
  "domainDepth": {
    "js-basic": "deep|medium|gap",
    "css": "deep|medium|gap",
    "browser": "deep|medium|gap",
    "vue": "deep|medium|gap",
    "react": "deep|medium|gap",
    "engineering": "deep|medium|gap",
    "network": "deep|medium|gap",
    "performance": "deep|medium|gap",
    "electron": "deep|medium|gap",
    "typescript": "deep|medium|gap"
  },
  "projects": [{ "name": "项目名", "tech": ["技术1"], "depth": "deep|medium" }],
  "overallLevel": "junior|mid|senior|staff",
  "highlights": ["简历中最值得深挖的2-3个亮点"],
  "blindSpots": ["该级别前端工程师应该掌握但简历未体现的知识点"]
}

判断规则（来自 mock-interview skill 的经验）：
- depth: 项目描述有量化成果、具体技术细节、踩坑复盘 → "deep"；简单提及技术栈 → "medium"
- highlights: 优先选有量化成果（性能提升X%、内存降低X MB）、从零搭建、独立完成的项目
- blindSpots: 对比前端知识域分类和该级别（${state.jd ? "JD要求 + " : ""}overallLevel）的期望，找出缺失；
  例：senior 前端如果没提性能优化经验 → 标记 blindSpots
- skillCategoryMap: 按知识域精准归类，同一技能不跨类
- domainDepth: 根据技能密度和项目深度判断每个域的深浅——
  技能多且项目深的域 → "deep"；技能少或仅简单提及的域 → "medium"；
  盲区/未涉及的域 → "gap"。
  注意 domainDepth 必须与 highlights/blindSpots/projects.depth 逻辑互恰：
  highlights 提到的域必须是 "deep"，blindSpots 提到的域必须是 "gap"，
  depth=deep 项目覆盖的域不能低于 "deep"，技能为空的域不能标 "deep"。
- 只列出简历中真实出现的技能与技术栈，不要编造简历里不存在的内容；识别不到就写空数组，不要硬凑`;

  // 手动重试：把上一次校验错误（JSON 畸形 / domainDepth 自洽性）回灌给 LLM。
  // 框架 retryPolicy 用相同入参重跑，模型会重复同一个错误（真实简历必卡在 domainDepth 校验），故改为手动回灌。
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const fullPrompt = prompt + (lastErr
      ? `\n\n⚠️ 你上一次的输出未通过校验，请修正后只输出修正后的纯 JSON（不要任何解释文字）：\n${lastErr}`
      : "");
    const response = await llm.invoke([new SystemMessage(fullPrompt)], { signal });
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { lastErr = "未找到 JSON 结构（LLM 返回格式异常）"; continue; }

    let analysis: ResumeAnalysis;
    try {
      analysis = resumeAnalysisSchema.parse(JSON.parse(jsonMatch[0])); // 畸形 → 捕获后回灌错误
    } catch (e) {
      lastErr = `JSON 结构校验失败：${e instanceof Error ? e.message : String(e)}`;
      continue;
    }

    // 一致性校验：domainDepth 必须与其他字段逻辑互恰（自洽性检查，不调 LLM）
    const consistencyIssues = validateDomainDepthConsistency(analysis, SKILL_CATEGORIES);
    if (consistencyIssues.length > 0) {
      lastErr = `domainDepth 一致性校验失败：${consistencyIssues.join("；")}`;
      continue;
    }

    logs = appendLog(runId, logs, `节点① 完成：识别 ${analysis.skills.length} 项技能，水平 ${analysis.overallLevel}`);
    return { analysis, logs };
  }
  throw new Error(lastErr || "简历分析失败：重试次数用尽");
}

// ============================================================
// 节点②：路由分流（确定性分类器，零 LLM 调用）
// 读 ① 已产出的 analysis → computeRouting → 注入 ② 让策略偏重题型。
// 不调 LLM、不加 retryPolicy（无外部依赖、不会失败）。
// ============================================================
async function routeCandidate(state: typeof WorkflowState.State) {
  const runId = state.runId;
  let logs = state.logs ?? [];
  const analysis = state.analysis!;
  const routing = computeRouting(analysis);
  logs = appendLog(
    runId,
    logs,
    `节点② 路由分流：level=${routing.level} targetRole=${routing.targetRole} hasBlindSpots=${routing.hasBlindSpots} bias(concept=${routing.bias.concept}, deepDive=${routing.bias.deepDive})`
  );
  return { routing, logs };
}

// ============================================================
// 节点③：AI 自主规划出题策略（融入 mock-interview 的三层追问框架）
// ============================================================
async function planStrategy(state: typeof WorkflowState.State, config?: any) {
  const llm = await createLLM();
  const analysis = state.analysis!;
  const runId = state.runId;
  const signal = config?.configurable?.signal as AbortSignal | undefined;
  let logs = state.logs ?? [];
  logs = appendLog(runId, logs, "节点③ 开始：规划出题策略");

  // 构造按知识域分组的能力画像
  const categorySummary = Object.entries(analysis.skillCategoryMap)
    .filter(([, skills]) => skills.length > 0)
    .map(([cat, skills]) => `- ${cat}: ${skills.join("、")}`)
    .join("\n");

  // 路由分流决策（确定性，非 LLM 再次分类）：把 ② 算出的偏重写进 prompt。
  const routing = state.routing;
  const routingHint = routing
    ? `【路由分流决策（由确定性分类器算出，请据此偏重出题）】
- 候选人水平：${routing.level}
- 目标角色：${routing.targetRole}（含后端技能时请适当加入后端视角/全栈协作问题）
- 题型权重建议：基础概念题 ≈ ${Math.round(routing.bias.concept * 100)}%、原理深挖/项目追问 ≈ ${Math.round(routing.bias.deepDive * 100)}%
- 请优先满足权重更高的题型分布：水平越高越侧重深挖与项目追问。${routing.hasBlindSpots ? `\n- ⚠️ 有技能缺口：请至少安排一道补缺型题目（depth=gap、questionType=gap-fill）覆盖盲区方向。` : ""}`
    : "";

  // 构造 domainDepth 摘要（确定性深度标记，驱动三层映射）
  const depthSummary = Object.entries(analysis.domainDepth)
    .map(([cat, d]) => `- ${cat}: ${d === "deep" ? "深挖" : d === "medium" ? "基础概念" : "补缺"}`)
    .join("\n");

  const prompt = `你是一位有10年经验的前端 Tech Lead 面试官。根据以下简历分析结果，决定出题策略。${routingHint}

候选人能力画像：
- 整体水平：${analysis.overallLevel}
- 主要技术栈：${analysis.primaryStack}
- 按知识域分类的能力：
${categorySummary}
- 各知识域深度标记（由节点①结构化分析得出，请严格据此分配题型）：
${depthSummary}
- 项目经验：${analysis.projects.map(p => `${p.name}（${p.tech.join("、")}，深度：${p.depth}）`).join("；")}
- 亮点：${analysis.highlights.join("、")}
- 盲区：${analysis.blindSpots.join("、") || "无"}
${state.jd ? `\n目标岗位JD已提供，请同时考虑JD要求但简历中缺失的技能作为 gap 域。` : ""}

出题策略（三层追问框架 + 确定性映射规则）：
- 题目应形成递进关系，覆盖从基础到深挖的完整知识链。
  各域 depth 和 questionType 严格按以下映射，不要自由发挥：
  · domainDepth="deep" → depth="deep", questionType="project-deep-dive"（第三层：实战追问）
  · domainDepth="medium" → depth="medium", questionType="concept"（第一/二层：基础概念+原理深挖）
  · domainDepth="gap" → depth="gap", questionType="gap-fill"（补缺题）
- 亮点域（deep）优先从对应的 highlights 中选项目追问素材。
- 有技能缺口且 hasBlindSpots 信号为 true 时，gap 域至少一道补缺题。

请以JSON格式返回出题策略（不要其他文字）：
{
  "domains": [
    {
      "name": "知识域名称",
      "category": "所属知识域分类（js-basic/css/browser/vue/react/engineering/network/performance/electron/typescript）",
      "depth": "deep|medium|gap",
      "questionType": "project-deep-dive|concept|gap-fill",
      "count": 1,
      "reasoning": "为什么选这个域和这种题型，以及属于三层追问框架的哪一层"
    }
  ]
}

策略规则：
- 总共生成8-10道题，至少覆盖2个不同的知识域分类
- depth 和 questionType 严格按 domainDepth 映射，不做自由裁量
- 题目难度由易到难排序：concept → gap-fill → project-deep-dive
- 同一候选人不要出雷同的题目，确保知识覆盖面广
- reasoning 字段解释为什么选这个域和这个数量，标注属于三层追问框架的哪一层`;

  // 手动重试：把上一次校验错误（JSON 畸形 / 总量 8-10 校验）回灌给 LLM，避免重复同一错误。
  let lastErr = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const fullPrompt = prompt + (lastErr
      ? `\n\n⚠️ 你上一次的输出未通过校验，请修正后只输出修正后的纯 JSON（不要任何解释文字）：\n${lastErr}`
      : "");
    const response = await llm.invoke([new SystemMessage(fullPrompt)], { signal });
    const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { lastErr = "未找到 JSON 结构（LLM 返回格式异常）"; continue; }

    let strategy: QuestionStrategy;
    try {
      strategy = strategySchema.parse(JSON.parse(jsonMatch[0])); // 畸形 → 捕获后回灌错误
    } catch (e) {
      lastErr = `JSON 结构校验失败：${e instanceof Error ? e.message : String(e)}`;
      continue;
    }

    // 总量校验：所有域的 count 总和必须在 8-10 范围内
    const countIssues = validateTotalCount(strategy);
    if (countIssues.length > 0) {
      lastErr = `出题策略总量校验失败：${countIssues.join("；")}`;
      continue;
    }

    logs = appendLog(runId, logs, `节点③ 完成：规划 ${strategy.domains.length} 个知识域，共 ${strategy.domains.reduce((s, d) => s + d.count, 0)} 题`);
    return { strategy, logs };
  }
  throw new Error(lastErr || "策略规划失败：重试次数用尽");
}

// ============================================================
// 节点④：生成题目（首次全量 / 精炼时只重出失败域）
// —— 抽出的 generateForDomain 被首次与重出共用，避免写两遍 ——
// ============================================================

// 单个知识域出题（含域级重试）。重出时 extraHint 带上「上一版为何不达标」
// emit：细粒度进度回调（由节点④经 config 传入），每域开始/成功/失败各推一条 SSE 事件
async function generateForDomain(
  domain: QuestionStrategy["domains"][number],
  analysis: ResumeAnalysis,
  llm: Awaited<ReturnType<typeof createLLM>>,
  runId: string,
  extraHint = "",
  emit?: (data: Record<string, unknown>) => void,
  index = 0,
  total = 1,
  abortSignal?: AbortSignal,
  forcePartial = false
): Promise<{ domainName: string; questions: GeneratedQuestion[]; ok: boolean; logLines: string[] }> {
  // 并行安全：每个域各写自己的 localLogs（日志便签本），跑完后再由调用方统一合并，
  // 避免 Promise.all 并发时多个域同时 appendLog 共享 logs 造成竞态丢日志。
  const localLogs: string[] = [];
  const log = (msg: string) => localLogs.push(msg);

  // 截图专用：config.configurable.forcePartial===true 时强制「第一个知识域」彻底失败（直接返回 failed，
  // 不消耗 LLM），用于稳定复现「域级部分失败琥珀条」截图。由路由从请求体透传，正常出题完全不受影响。
  if (forcePartial === true && index === 0) {
    emit?.({ phase: "domain", status: "running", domain: domain.name, index, total });
    emit?.({ phase: "domain", status: "failed", domain: domain.name, index, total });
    return { domainName: domain.name, questions: [], ok: false, logLines: localLogs };
  }

  // 域级进度：开始时立即推送（让前端逐个点亮，而非等 9 域整团完成）
  emit?.({ phase: "domain", status: "running", domain: domain.name, index, total });

  const questionTemplate = domain.questionType === "project-deep-dive"
    ? `项目追问型（来自 bq-skill 的 STAR 框架）：
- 开场：描述你做过的一个具体场景/挑战（Situation & Task）
- 追问：你采取了什么行动（Action）？为什么选这个方案而不是其他？
- 深挖：最终效果如何（Result）？有什么可以改进的地方？
- 追问：如果让你重新设计，会怎么做？
- 难度 4-5，题目应包含多个子问题引导候选人展开`
    : domain.questionType === "gap-fill"
    ? `补盲基础型（来自 mock-interview 的"第一层：基础概念"）：
- 考察核心概念和基本原理，确保候选人真正理解而非背诵
- 用"说说你对XX的理解"这类开放句式，而非判断题
- 难度 2-3，题目面向该领域入门者`
    : `概念深挖型（来自 mock-interview 的"第一层+第二层"）：
- 第一层：用一个开放式问题确认基本理解
- 第二层：在题目中预留追问空间（"请进一步说明...""与XX相比有什么区别？"）
- 考察原理理解、最佳实践、技术对比和实际应用场景
- 难度 3-4`;

  const prompt = `你是一位有10年经验的前端 Tech Lead 面试官。请根据以下信息生成面试题目。

候选人水平：${analysis.overallLevel}
主要技术栈：${analysis.primaryStack}
当前知识域：${domain.name}（分类：${domain.category}）
经验深度：${domain.depth}
题目类型：${domain.questionType}

${questionTemplate}
${extraHint}

请生成 ${domain.count} 道题，JSON 数组格式（不要其他文字）：
[
  {
    "title": "题目（一句话，尽量用开放式问法）",
    "content": "详细题目内容（包含必要的上下文、具体场景描述或追问子问题）",
    "difficulty": 数字1-5,
    "tags": ["知识域标签1", "知识域标签2"]
  }
]

重要提醒（来自 mock-interview 的经验）：
- 题目应该是开放式的，引导候选人展开回答，而非简单的是非题
- project-deep-dive 型题目要包含具体场景，让候选人讲真实的项目经历
- 标签使用前端行业常用的术语，如"Vue3响应式原理""Webpack Tree Shaking""浏览器渲染管线"
- 内容中可以包含2-3个引导性的子问题，模拟真实面试中的追问节奏`;

  // —— 域级重试 ——
  // 不能交给 LangGraph 框架重试：框架重试是"重跑整个节点函数"，会把已成功的域也连坐重跑。
  // 这里只在循环内对"当前域这一次调用"重试，已成功的域不受影响。
  let domainQuestions: GeneratedQuestion[] = [];
  let ok = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await withTimeout(
        (signal) => llm.invoke([new SystemMessage(prompt)], { signal }),
        NODE_TIMEOUT_MS,
        abortSignal
      );
      const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("LLM 未返回题目 JSON 数组");
      const parsed: unknown = JSON.parse(jsonMatch[0]);
      const validated = generatedQuestionSchema.parse(parsed); // 畸形 → 抛 ZodError → 重试

      // 给每题打内部标记 _domain，供 ⑤ 分组校验、④ 重出时「只换坏桶」
      domainQuestions = validated.map((q) => ({ ...q, _domain: domain.name }));
      ok = true;
      log(`节点④ 域[${domain.name}] 第${attempt}次成功，生成 ${domainQuestions.length} 题`);
      emit?.({ phase: "domain", status: "success", domain: domain.name, count: domainQuestions.length, index, total, questions: domainQuestions });
      break;
    } catch (error) {
      // 用户取消：中止信号已触发 → 不再重试，直接上抛中断整个节点（避免无谓重发 LLM 请求消耗 token）
      if (abortSignal?.aborted) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      log(`节点④ 域[${domain.name}] 第${attempt}次失败：${msg}`);
      if (attempt < MAX_ATTEMPTS) continue; // 只重跑本次调用，不动已成功的域
    }
  }

  if (!ok) {
    log(`节点④ 域[${domain.name}] 重试 ${MAX_ATTEMPTS} 次均失败，已跳过`);
    emit?.({ phase: "domain", status: "failed", domain: domain.name, index, total });
  }
  return { domainName: domain.name, questions: domainQuestions, ok, logLines: localLogs };
}

// 补生成（仅首轮去重后触发）：针对去重后空缺的域 / 总数低于 strategy 期望数，补出不重复的新题。
// 复用 generateForDomain；extraHint 携带已保留标题清单，从源头避免重复。精炼轮不调用（避免干扰精炼环）。
async function generateSupplement(
  emptyDomains: QuestionStrategy["domains"][number][],
  deficit: number,
  usedTitles: string[],
  analysis: ResumeAnalysis,
  llm: Awaited<ReturnType<typeof createLLM>>,
  runId: string,
  abortSignal?: AbortSignal
): Promise<GeneratedQuestion[]> {
  const avoidHint = usedTitles.length
    ? `\\n（请勿生成与以下标题重复或高度相似的题：\\n- ${usedTitles.join("\\n- ")}）`
    : "";
  const out: GeneratedQuestion[] = [];
  for (const d of emptyDomains) {
    const r = await generateForDomain(d, analysis, llm, runId, avoidHint, undefined, 0, 1, abortSignal, false);
    if (r.ok) out.push(...r.questions);
  }
  if (out.length < deficit) {
    const supplementDomain: QuestionStrategy["domains"][number] = {
      name: "补充题",
      category: "engineering",
      depth: "medium",
      questionType: "concept",
      count: deficit - out.length,
      reasoning: "去重后数量补齐",
    };
    const r = await generateForDomain(supplementDomain, analysis, llm, runId, avoidHint, undefined, 0, 1, abortSignal, false);
    if (r.ok) out.push(...r.questions);
  }
  return out;
}

async function generateQuestions(state: typeof WorkflowState.State, config?: any) {
  // 从 LangGraph 注入的 configurable 中拿到 SSE 推送函数，透传给每个域（用于域级细粒度进度）
  const emit = config?.configurable?.emit as ((data: Record<string, unknown>) => void) | undefined;
  // 取消信号同样来自 configurable（route 透传的 request.signal），传给每个域用于真正中断 LLM 调用
  const abortSignal = config?.configurable?.signal as AbortSignal | undefined;
  const llm = await createLLM();
  const analysis = state.analysis!;
  const strategy = state.strategy!;
  const runId = state.runId;
  let logs = state.logs ?? [];

  const refineDomains = state.refineDomains ?? [];
  const isRefine = refineDomains.length > 0;

  if (isRefine) {
    logs = appendLog(runId, logs, `节点④ 精炼重出：针对 ${refineDomains.join("、")}`);
  } else {
    logs = appendLog(runId, logs, `节点④ 开始：为 ${strategy.domains.length} 个知识域生成题目`);
  }

  // 重出时：保留上一轮「非失败域」的好题（只换坏桶，不连坐好域——呼应你答对的粒度判断）
  const keepDomains = new Set(
    strategy.domains.map((d) => d.name).filter((n) => !refineDomains.includes(n))
  );
  const keptQuestions = isRefine
    ? (state.questions ?? []).filter((q) => q._domain && keepDomains.has(q._domain))
    : [];

  const domainsToProcess = isRefine
    ? strategy.domains.filter((d) => refineDomains.includes(d.name))
    : strategy.domains;

  const newQuestions: GeneratedQuestion[] = [];
  const callFailed: string[] = []; // 调用层彻底失败（已重试 3 次）的域，不再进精炼环

  // 重出时注入「上一版为何不达标」，让题变聪明（这就是自我优化的实质）。提到循环外只算一次。
  const hint = isRefine
    ? `（精炼优化提示：上一版该题未通过质量校验。请重点改进——确保题目为开放式问法（含为什么/如何/说说等）、与候选人技术栈相关、内容充实（30字以上）、带知识域标签。）`
    : "";

  // 限并发出题：各知识域互相独立，经实测 DeepSeek 在 5 路下零 429 且提速最优（≈3.8x）。
  // 故采用 5 路并发（mapWithConcurrency）：吃满扇出提速、又留安全余量（实测 10 路仍零 429）。
  // 每个域在 generateForDomain 内部各自写 localLogs，这里按 domainsToProcess 固定顺序逐个合并，避免竞态。
  // 同时把 emit + index/total 透传给每个域，让前端能看到「第 i/N 个域」的细粒度进度。
  const total = domainsToProcess.length;
  const parallelStart = Date.now();
  const results = await mapWithConcurrency(
    domainsToProcess,
    5,
    (d, i) => generateForDomain(d, analysis, llm, runId, hint, emit, i, total, abortSignal, !!config?.configurable?.forcePartial)
  );
  const parallelMs = Date.now() - parallelStart;
  logs = appendLog(runId, logs, `节点④ 限并发出题：${domainsToProcess.length} 个域、最多 5 路并发调用 LLM，总窗口耗时 ${parallelMs}ms`);
  for (const r of results) {
    for (const line of r.logLines) logs = appendLog(runId, logs, line);
    if (r.ok) newQuestions.push(...r.questions);
    else callFailed.push(r.domainName);
  }

  const allQuestions = [...keptQuestions, ...newQuestions];
  // ② 档去重：单次运行内可能产出标题重复的题，归一化去重后再交 ⑤ 校验。
  const { deduped: dedupedQuestions, removed: dupRemoved } = dedupeQuestions(allQuestions);
  logs = appendLog(runId, logs, `节点④ 完成：生成 ${allQuestions.length} 题，同轮去重移除 ${dupRemoved} 道，剩余 ${dedupedQuestions.length} 题，调用层失败域 ${callFailed.length} 个`);

  // 补生成（仅首轮）：去重后某域空缺 或 总数低于 strategy 期望数 → 补出不重复的新题，避免「去重把题丢光 / 总数不保底」。
  let finalQuestions = dedupedQuestions;
  if (!isRefine) {
    const expectedTotal = strategy.domains.reduce((s, d) => s + d.count, 0);
    const presentDomains = new Set(dedupedQuestions.map((q) => q._domain));
    // 仅补「去重导致空缺」的域；LLM 真挂的域（callFailed）不再无谓重试，差额由下方合成补充域兜底。
    const emptyDomains = strategy.domains.filter(
      (d) => d.count > 0 && !presentDomains.has(d.name) && !callFailed.includes(d.name)
    );
    const deficit = expectedTotal - dedupedQuestions.length;
    if (emptyDomains.length > 0 || deficit > 0) {
      logs = appendLog(runId, logs, `节点④ 补生成触发：空域 ${emptyDomains.length} 个、差额 ${Math.max(deficit, 0)} 道`);
      const usedTitles = dedupedQuestions.map((q) => q.title ?? "");
      const supplement = await generateSupplement(emptyDomains, Math.max(deficit, 0), usedTitles, analysis, llm, runId, abortSignal);
      finalQuestions = dedupeQuestions([...dedupedQuestions, ...supplement]).deduped;
      logs = appendLog(runId, logs, `节点④ 补生成完成：补充 ${supplement.length} 道，去重后共 ${finalQuestions.length} 题`);
    }
  }

  // 调用层失败域已重试 3 次，累积记入 callFailedDomains（不再进 refineDomains，不参与精炼重出）
  const callFailedDomains = Array.from(new Set([...(state.callFailedDomains ?? []), ...callFailed]));
  return { questions: finalQuestions, failedDomains: callFailedDomains, callFailedDomains, refineDomains: [], generationDone: true, logs };
}

// ============================================================
// 节点⑤：确定性语义校验（硬门禁主力，不靠 LLM 评分）
// 对每题做客观规则检查，违规题所属域进入「重出」队列（refineDomains）。
// 只打标、不改 questions——重出由 ④ 负责（精炼环回节点④只重出失败域）。
// ============================================================
async function validateQuestions(state: typeof WorkflowState.State) {
  const runId = state.runId;
  let logs = state.logs ?? [];
  const analysis = state.analysis!;

  const ctx = {
    primaryStack: analysis.primaryStack,
    skills: analysis.skills,
    resumeText: state.resume,
  };

  const issuesByDomain: Record<string, string[]> = {};
  for (const q of state.questions ?? []) {
    const domain = q._domain ?? "";
    const issues = validateQuestionSemantics(q, ctx);
    if (issues.length > 0) {
      (issuesByDomain[domain] ||= []).push(...issues);
    }
  }

  const semanticFailed = Object.keys(issuesByDomain);
  const round = (state.round ?? 0) + 1; // 第几次校验（也代表已完成的生成轮次）

  logs = appendLog(runId, logs, `节点⑤ 校验：第 ${round} 轮，发现 ${semanticFailed.length} 个域不达标`);
  for (const d of semanticFailed) {
    logs = appendLog(runId, logs, `  域[${d}] 问题：${issuesByDomain[d].join("；")}`);
  }

  // 最终 failedDomains = 调用层失败（始终失败）+ 本轮语义失败（每轮重算，不含历史已修好的域）
  const failedDomains = Array.from(new Set([...(state.callFailedDomains ?? []), ...semanticFailed]));

  return { round, refineDomains: semanticFailed, failedDomains, logs };
}

// 条件边判定：是否进入精炼环（回 ④ 重出失败域）
function shouldRefine(state: typeof WorkflowState.State): "refine" | "end" {
  const failed = state.refineDomains ?? [];
  // round <= MAX_REFINE_ROUNDS：如上限 2，则第 1、2 轮校验失败都触发重出，第 3 轮停止
  return failed.length > 0 && (state.round ?? 0) <= MAX_REFINE_ROUNDS ? "refine" : "end";
}

// ============================================================
// 构建完整图（含自我优化闭环）
// ============================================================
export function buildWorkflow() {
  const graph = new StateGraph(WorkflowState)
    .addNode("analyzeResume", analyzeResume, {
      timeout: NODE_TIMEOUT_MS,
    })
    .addNode("planStrategy", planStrategy, {
      timeout: NODE_TIMEOUT_MS,
    })
    .addNode("routeCandidate", routeCandidate) // 确定性分类器，无外部调用、不需重试
    .addNode("generateQuestions", generateQuestions) // 节点④ 内部已手写域级重试，不挂框架重试
    .addNode("validateQuestions", validateQuestions) // 确定性门禁，无外部调用、不需重试
    .addEdge(START, "analyzeResume")
    .addEdge("analyzeResume", "routeCandidate")
    .addEdge("routeCandidate", "planStrategy")
    .addEdge("planStrategy", "generateQuestions")
    .addEdge("generateQuestions", "validateQuestions")
    // 自我优化闭环：④ 发现有域不达标且未达轮次上限 → 回 ④（generateQuestions）只重出失败域
    .addConditionalEdges("validateQuestions", shouldRefine, {
      refine: "generateQuestions",
      end: END,
    });

  return graph.compile();
}
