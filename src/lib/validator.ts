import { z } from "zod";

// 题目表单的校验规则（Day 9 起，createQuestion 与 updateQuestion 共用）
// 关键：表单传来的值都是「字符串」，所以 difficulty 用 z.coerce.number() 自动转成数字
export const questionSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空"),
  content: z.string().trim().min(1, "内容不能为空"),
  difficulty: z.coerce.number().int().min(1).max(5, "难度必须是 1-5"),
  // Day 10·TG-2 补全：题目表单多选关联标签（多对多）。
  // 表单里每个选中的标签用一个 name="tagIds" 的隐藏 input 提交，
  // 后端 formData.getAll("tagIds") 拿到字符串数组。允许为空（题目可无标签），
  // 所以 optional().default([]) 兜底空数组，避免 Zod 报 "required"。
  tagIds: z.array(z.string()).optional().default([]),
});

// 节点④ 对 LLM 返回的「题目数组」做运行时校验（Day 14）
// 用途：LLM 偶尔会返回缺字段/类型错的题目，这里在写回 state 前拦一道，
// 校验不通过就当作该域本次调用失败 → 进入域级重试。
export const generatedQuestionSchema = z.array(
  z.object({
    title: z.string().min(1, "标题不能为空"),
    content: z.string().min(1, "内容不能为空"),
    difficulty: z.coerce.number().int().min(1).max(5, "难度必须是 1-5"),
    tags: z.array(z.string()).default([]),
  })
);

// 节点① 对 LLM 返回的「简历分析」做运行时校验（与 ④ 同一套生产级模式）
// 用途：LLM 偶尔会返回缺字段/类型错的分析，这里在写入 state 前拦一道，
// 校验不通过就抛 ZodError → 节点①抛错 → LangGraph 框架 retryPolicy 自动重试（最多 3 次）。
// 与 ③ 一致：畸形即重试，不再 silently（静默）产出坏数据。
export const resumeAnalysisSchema = z.object({
  primaryStack: z.string(),
  skills: z.array(z.string()),
  skillCategoryMap: z.record(z.string(), z.array(z.string())),
  domainDepth: z.record(z.string(), z.enum(["deep", "medium", "gap"])),
  projects: z.array(
    z.object({
      name: z.string(),
      tech: z.array(z.string()),
      depth: z.enum(["deep", "medium"]),
    })
  ),
  overallLevel: z.enum(["junior", "mid", "senior", "staff"]),
  highlights: z.array(z.string()),
  blindSpots: z.array(z.string()),
});

// 节点③ 对 LLM 返回的「出题策略」做运行时校验（与 ① ④ 同一套生产级模式）
// 用途：LLM 偶尔会返回缺字段/类型错的策略（如 domains 缺失、depth 枚举错、count 非数字），
// 这里在写入 state 前拦一道；校验不通过就抛 ZodError → 节点③抛错 →
// LangGraph 框架 retryPolicy 自动重试（最多 3 次）。畸形即重试，不再 silently 产出坏数据。
export const strategySchema = z.object({
  domains: z
    .array(
      z.object({
        name: z.string().min(1, "知识域名称不能为空"),
        category: z.string().min(1, "知识域分类不能为空"),
        depth: z.enum(["deep", "medium", "gap"]),
        questionType: z.enum(["project-deep-dive", "concept", "gap-fill"]),
        count: z.coerce.number().int().min(1).max(10, "每域题数须在 1-10"),
        reasoning: z.string().min(1, "reasoning 不能为空"),
      })
    )
    .min(1, "至少需要一个知识域"),
});

// 字段级错误类型：{ 字段名: 该字段的错误信息数组 }
export type FieldErrors = Record<string, string[]>;

// 把 Zod 的 error.issues 转成 UI 好用的扁平结构
// （逻辑和你跑过的演示脚本里的 for 循环一模一样，只是搬到了项目里）
export function formatZodError(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    (fieldErrors[key] ||= []).push(issue.message);
  }
  return fieldErrors;
}

// ============================================================
// Day 14 精炼环：确定性语义校验（硬门禁主力，不靠 LLM 评分）
// 用途：④ 校验节点对每题做客观规则检查，违规的题所属域进入「重出」队列。
// 这些是代码 100% 可判定的规则，可靠性远高于 LLM 评委，所以用作硬门禁。
// ============================================================

export interface SemanticContext {
  primaryStack: string;
  skills: string[]; // 候选人的技能关键词
  resumeText: string; // 原始简历文本（相关性兜底匹配）
}

// 开放式问法关键词：含其一即视为「引导候选人展开」，而非是非题
const OPENING_KEYWORDS = [
  "为什么", "如何", "说说", "怎么", "区别", "对比", "解释", "设计", "什么", "哪些", "怎样",
];
const MIN_CONTENT_LEN = 30;

export function validateQuestionSemantics(
  q: { title: string; content: string; difficulty: number; tags: string[] },
  ctx: SemanticContext
): string[] {
  const issues: string[] = [];

  if (typeof q.difficulty !== "number" || q.difficulty < 1 || q.difficulty > 5) {
    issues.push("难度必须在 1-5 之间");
  }
  if (!q.content || q.content.trim().length < MIN_CONTENT_LEN) {
    issues.push(`题目内容过短（少于 ${MIN_CONTENT_LEN} 字）`);
  }
  if (!Array.isArray(q.tags) || q.tags.length === 0) {
    issues.push("缺少知识域标签");
  }

  const text = `${q.title} ${q.content}`;
  const hasOpening = OPENING_KEYWORDS.some((k) => text.includes(k));
  if (!hasOpening) {
    issues.push("缺少开放式问法（应含为什么/如何/说说/区别等）");
  }

  // 相关性：标题或内容需与候选人技能/技术栈有至少一个词重叠
  const haystack = text.toLowerCase();
  const keywords = [ctx.primaryStack, ...ctx.skills].filter(Boolean).map((s) => s.toLowerCase());
  const related = keywords.some((k) => k && haystack.includes(k));
  if (!related) {
    issues.push("与候选人简历/技能缺乏相关性");
  }

  return issues;
}

// ============================================================
// 节点① domainDepth 一致性校验（自洽性检查，不调 LLM）
// 用途：大模型输出 domainDepth 后，验证它与其他字段是否逻辑互恰。
// 不一致 → 抛错 → 节点①重试。不验证"深度判断对不对"，只验证"输出自不自洽"。
// ============================================================

/** 收集所有技能域 key（来自 skillCategoryMap 的键 + domainDepth 的键的并集） */
function allDomains(analysis: { skillCategoryMap: Record<string, string[]>; domainDepth: Record<string, string> }): string[] {
  return Array.from(new Set([...Object.keys(analysis.skillCategoryMap), ...Object.keys(analysis.domainDepth)]));
}

export function validateDomainDepthConsistency(
  analysis: { skillCategoryMap: Record<string, string[]>; domainDepth: Record<string, string>; highlights: string[]; blindSpots: string[]; projects: { name: string; tech: string[]; depth: string }[] },
  skillCategories: readonly string[]
): string[] {
  const issues: string[] = [];

  // 规则1：亮点域必为 deep —— highlight 文本命中了某个技能域 → 该域 domainDepth 必须是 deep
  for (const cat of skillCategories) {
    for (const h of analysis.highlights) {
      if (h.toLowerCase().includes(cat.toLowerCase()) && analysis.domainDepth[cat] !== undefined && analysis.domainDepth[cat] !== "deep") {
        issues.push(`亮点"${h}"覆盖了 ${cat} 域，但 domainDepth 标记为 ${analysis.domainDepth[cat]}，应为 deep`);
      }
    }
  }

  // 规则2：deep 项目覆盖的域不能低于 deep
  for (const proj of analysis.projects) {
    if (proj.depth !== "deep") continue;
    for (const t of proj.tech) {
      for (const cat of skillCategories) {
        if (t.toLowerCase().includes(cat.toLowerCase()) && analysis.domainDepth[cat] !== undefined && analysis.domainDepth[cat] !== "deep") {
          issues.push(`项目"${proj.name}"标记为 deep，覆盖 ${cat} 域（${t}），但 domainDepth 标记为 ${analysis.domainDepth[cat]}，不应低于 deep`);
        }
      }
    }
  }

  // 规则3：技能缺口域必为 gap
  for (const bs of analysis.blindSpots) {
    for (const cat of skillCategories) {
      if (bs.toLowerCase().includes(cat.toLowerCase()) && analysis.domainDepth[cat] !== undefined && analysis.domainDepth[cat] !== "gap") {
        issues.push(`技能缺口"${bs}"覆盖了 ${cat} 域，但 domainDepth 标记为 ${analysis.domainDepth[cat]}，应为 gap`);
      }
    }
  }

  // 规则4：技能为空的域不能标 deep
  for (const cat of skillCategories) {
    const skills = analysis.skillCategoryMap[cat];
    if ((!skills || skills.length === 0) && analysis.domainDepth[cat] === "deep") {
      issues.push(`${cat} 域技能为空，但 domainDepth 标记为 deep——没有技能不应出深挖题`);
    }
  }

  return issues;
}

// ============================================================
// 节点③ 出题策略总量校验（确定性规则，不调 LLM）
// 用途：验证所有域的 count 总和是否在 8-10 范围内。
// 超出范围 → 抛错 → 节点③重试。
// ============================================================
export const MIN_TOTAL_QUESTIONS = 8;
export const MAX_TOTAL_QUESTIONS = 10;

export function validateTotalCount(strategy: { domains: { count: number }[] }): string[] {
  const total = strategy.domains.reduce((sum, d) => sum + d.count, 0);
  if (total < MIN_TOTAL_QUESTIONS) {
    return [`题目总数 ${total} 低于下限 ${MIN_TOTAL_QUESTIONS}`];
  }
  if (total > MAX_TOTAL_QUESTIONS) {
    return [`题目总数 ${total} 超过上限 ${MAX_TOTAL_QUESTIONS}`];
  }
  return [];
}
