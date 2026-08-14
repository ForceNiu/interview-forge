import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// ============================================================
// 最小演示：证明"状态在节点间自动流转，不需要手动传递"
// 不调任何 LLM，零成本
// ============================================================

// 状态里有两个字段：
//  - log：记录执行轨迹
//  - greeting：一个自定义字段，由 nodeA 写入，看后面的节点能不能直接读到
const DemoState = Annotation.Root({
  log: Annotation<string[]>,
  greeting: Annotation<string>(),
});

// nodeA：往 log 追加自己，同时往 state 里写一个自定义字段 greeting
// 注意：它只 return 这两个字段，不 return 其他
async function nodeA(state: typeof DemoState.State) {
  return {
    log: [...state.log, "nodeA 跑了"],
    greeting: "你好，我来自节点A",
  };
}

// nodeB：完全不碰 greeting，只追加自己的 log
// 关键：nodeB 的返回里没有 greeting，但 greeting 也不会丢
async function nodeB(state: typeof DemoState.State) {
  return { log: [...state.log, "nodeB 跑了"] };
}

// nodeC：直接读 state.greeting
// 这个 greeting 来自 nodeA 写的，中间 nodeB 没碰过、也没人手动传过
async function nodeC(state: typeof DemoState.State) {
  return {
    log: [...state.log, `nodeC 读到 greeting: "${state.greeting}"`],
  };
}

// 把三个节点按 A → B → C 的顺序连起来
// nodeB 夹在中间，但它对 greeting 毫无操作
const graph = new StateGraph(DemoState)
  .addNode("nodeA", nodeA)
  .addNode("nodeB", nodeB)
  .addNode("nodeC", nodeC)
  .addEdge(START, "nodeA")
  .addEdge("nodeA", "nodeB")
  .addEdge("nodeB", "nodeC")
  .addEdge("nodeC", END);

export async function POST() {
  const compiled = graph.compile();
  // 初始状态：log 为空数组，greeting 给个空串（外部传入模式，和真实项目里 resume 一样）
  const result = await compiled.invoke({ log: [], greeting: "" });
  return Response.json({ 执行顺序: result.log, greeting最终值: result.greeting });
}
