import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { buildWorkflow } from "../workflow";
import { createLLM } from "../client";

// 用假实现替换 LangGraph 与 @langchain/core/messages：
// 避免 Jest 去加载它们的 ESM 产物（默认不转译 node_modules）。
// 假的 StateGraph 支持 addConditionalEdges + 循环执行，从而真正跑通「精炼环」逻辑。
jest.mock("@langchain/langgraph", () => {
  class FakeAnnotation {
    static Root(spec: any) {
      return spec;
    }
  }
  class FakeStateGraph {
    nodes: Record<string, (state: any) => any> = {};
    edges: { from: string; to: string }[] = [];
    condEdges: { from: string; pathFn: (s: any) => string; map: Record<string, string> }[] = [];
    addNode(name: string, fn: any) {
      this.nodes[name] = fn;
      return this;
    }
    addEdge(from: string, to: string) {
      this.edges.push({ from, to });
      return this;
    }
    addConditionalEdges(from: string, pathFn: any, map: Record<string, string>) {
      this.condEdges.push({ from, pathFn, map });
      return this;
    }
    compile() {
      const nodes = this.nodes;
      const edges = this.edges;
      const condEdges = this.condEdges;
      const run = async (input: any) => {
        let state = { ...input };
        let cur = "START";
        let guard = 0;
        while (cur !== "END" && guard++ < 100) {
          const ce = condEdges.find((e) => e.from === cur);
          let next: string | undefined;
          if (ce) next = ce.map[ce.pathFn(state)];
          else {
            const e = edges.find((ed) => ed.from === cur);
            next = e ? e.to : undefined;
          }
          if (!next || next === "END") break;
          state = { ...state, ...(await nodes[next](state)) };
          cur = next;
        }
        return state;
      };
      return {
        async invoke(input: any) {
          return run(input);
        },
        async *stream(input: any) {
          yield await run(input);
        },
      };
    }
  }
  return { StateGraph: FakeStateGraph, Annotation: FakeAnnotation, START: "START", END: "END" };
});

jest.mock("@langchain/core/messages", () => ({
  SystemMessage: class {
    content: any;
    constructor(content: any) {
      this.content = content;
    }
  },
}));

jest.mock("../client", () => ({ createLLM: jest.fn() }));

const ANALYSIS = {
  primaryStack: "Vue",
  skills: ["Vue3", "Pinia"],
  skillCategoryMap: { vue: ["Vue3"], engineering: ["Vite"] },
  domainDepth: { vue: "deep", engineering: "medium" } as const,
  projects: [{ name: "P1", tech: ["Vue3"], depth: "deep" as const }],
  overallLevel: "senior" as const,
  highlights: ["亮点"],
  blindSpots: [],
};

const DEFAULT_STRATEGY = {
  domains: [
    { name: "A", category: "vue", depth: "deep", questionType: "project-deep-dive", count: 5, reasoning: "r" },
    { name: "B", category: "react", depth: "medium", questionType: "concept", count: 3, reasoning: "r" },
  ],
};

// 合规题：可通过 ⑤ 确定性语义校验（开放式 + 相关 + 内容充实）
const GOOD_Q = {
  title: "说说Vue3响应式原理",
  content: "请解释为什么Vue3用Proxy实现响应式，与Vue2的Object.defineProperty有什么区别？具体说明依赖收集过程。",
  difficulty: 4,
  tags: ["Vue3响应式原理"],
};
// 不合规题：格式对但语义差（内容过短 + 无开放式 + 不相关）
const BAD_Q = { title: "t", content: "c", difficulty: 3, tags: ["x"] };

const llm: { invoke: any } = { invoke: jest.fn() };

beforeEach(() => {
  (createLLM as any).mockResolvedValue(llm);
  (llm.invoke as any).mockReset();
  // 默认实现：分析/策略正常，出题返回合规题
  (llm.invoke as any).mockImplementation(async (messages: any[]) => {
    const content: string = messages[0]?.content ?? "";
    if (content.includes("请分析以下简历")) return { content: JSON.stringify(ANALYSIS) };
    if (content.includes("决定出题策略")) return { content: JSON.stringify(DEFAULT_STRATEGY) };
    return { content: JSON.stringify([{ ...GOOD_Q }]) };
  });
});

const baseInput = () => ({
  resume: "简历文本",
  jd: "",
  analysis: null,
  strategy: null,
  questions: [],
  failedDomains: [],
  callFailedDomains: [],
  logs: [],
  runId: "test-run",
  generationDone: false,
  round: 0,
  refineDomains: [],
});

describe("workflow 节点④ 域级失败隔离（Day 14）", () => {
  it("某域调用层失败不影响其他域：失败域进 failedDomains，成功域题目正常产出", async () => {
    const strategy = {
      domains: [
        { name: "Vue 原理", category: "vue", depth: "deep", questionType: "project-deep-dive", count: 5, reasoning: "r" },
        { name: "FAIL_DOMAIN", category: "engineering", depth: "medium", questionType: "concept", count: 3, reasoning: "r" },
      ],
    };
    (llm.invoke as any).mockImplementation(async (messages: any[]) => {
      const content: string = messages[0]?.content ?? "";
      if (content.includes("请分析以下简历")) return { content: JSON.stringify(ANALYSIS) };
      if (content.includes("决定出题策略")) return { content: JSON.stringify(strategy) };
      if (content.includes("当前知识域：FAIL_DOMAIN")) throw new Error("simulated LLM failure");
      return { content: JSON.stringify([{ ...GOOD_Q }]) };
    });

    const graph = buildWorkflow();
    const result = await graph.invoke(baseInput());

    expect(result.analysis).not.toBeNull();
    expect(result.strategy).not.toBeNull();
    expect(result.failedDomains).toContain("FAIL_DOMAIN");
    expect(result.questions).toHaveLength(1); // 仅 Vue 原理域成功产出
    expect(result.generationDone).toBe(true);
  });

  it("全部成功时 failedDomains 为空、题目正常产出", async () => {
    const graph = buildWorkflow();
    const result = await graph.invoke(baseInput());

    expect(result.failedDomains).toEqual([]);
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.generationDone).toBe(true);
  });
});

describe("精炼环（自我优化闭环）", () => {
  it("环收敛：首次语义不达标 → 重出修好 → 最终无失败域、轮次达到上限", async () => {
    // 首次出题（无精炼提示）返回不合规题，重出（带精炼提示）返回合规题
    (llm.invoke as any).mockImplementation(async (messages: any[]) => {
      const content: string = messages[0]?.content ?? "";
      if (content.includes("请分析以下简历")) return { content: JSON.stringify(ANALYSIS) };
      if (content.includes("决定出题策略")) return { content: JSON.stringify(DEFAULT_STRATEGY) };
      const isRefine = content.includes("精炼优化提示");
      return { content: JSON.stringify([isRefine ? { ...GOOD_Q } : { ...BAD_Q }]) };
    });

    const graph = buildWorkflow();
    const result = await graph.invoke(baseInput());

    // A、B 两域首次都不达标，重出后都修好
    expect(result.questions).toHaveLength(2);
    expect(result.failedDomains).toEqual([]); // 修好，最终无失败域
    expect(result.round).toBe(2); // 重出 2 轮后收敛
  });

  it("环终止：永远不达标 → 到轮次上限停止、不死循环、失败域被记录", async () => {
    // 无论首次还是重出都返回不合规题
    (llm.invoke as any).mockImplementation(async (messages: any[]) => {
      const content: string = messages[0]?.content ?? "";
      if (content.includes("请分析以下简历")) return { content: JSON.stringify(ANALYSIS) };
      if (content.includes("决定出题策略")) return { content: JSON.stringify(DEFAULT_STRATEGY) };
      return { content: JSON.stringify([{ ...BAD_Q }]) };
    });

    const graph = buildWorkflow();
    const result = await graph.invoke(baseInput());

    // 不死循环：测试能正常结束；轮次停在上限 +1（round=3 时 shouldRefine 返回 end）
    expect(result.round).toBe(3);
    expect(result.failedDomains).toContain("A");
    expect(result.failedDomains).toContain("B");
  });
});

describe("路由分流（确定性分类器，零 LLM 调用）", () => {
  it("资深纯前端简历 → 路由 frontend，偏重原理深挖（不调 LLM）", async () => {
    const graph = buildWorkflow();
    const result = await graph.invoke(baseInput());

    expect(result.routing).not.toBeNull();
    const routing = result.routing!;
    expect(routing.level).toBe("senior");
    expect(routing.targetRole).toBe("frontend");
    expect(routing.bias.deepDive).toBe(0.71); // senior 偏深挖，deepDive 占七成
    expect(routing.bias.concept).toBe(0.29);
  });

  it("含后端技能且有盲区 → 路由 fullstack，补盲权重抬高", async () => {
    const fullstackAnalysis = {
      primaryStack: "Node",
      skills: ["Node", "Express", "PostgreSQL"],
      skillCategoryMap: { engineering: ["Node"] },
      domainDepth: { engineering: "deep", performance: "medium" } as const,
      projects: [{ name: "P", tech: ["Node"], depth: "deep" as const }],
      overallLevel: "senior" as const,
      highlights: ["h"],
      blindSpots: ["性能优化"],
    };
    (llm.invoke as any).mockImplementation(async (messages: any[]) => {
      const content: string = messages[0]?.content ?? "";
      if (content.includes("请分析以下简历")) return { content: JSON.stringify(fullstackAnalysis) };
      if (content.includes("决定出题策略")) return { content: JSON.stringify(DEFAULT_STRATEGY) };
      return { content: JSON.stringify([{ ...GOOD_Q }]) };
    });

    const graph = buildWorkflow();
    const result = await graph.invoke(baseInput());

    const routing = result.routing!;
    expect(routing.targetRole).toBe("fullstack"); // 命中后端关键词 → fullstack
    expect(routing.hasBlindSpots).toBe(true); // 盲区 → 标记 hasBlindSpots
  });
});
