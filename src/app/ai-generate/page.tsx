"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { difficultyColor, difficultyLabel } from "@/lib/difficulty";
import { ERROR_KIND_ICON, type ErrorKind } from "@/lib/ai/errorMessage";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// ─── 类型 ───

interface Question {
  title: string;
  content: string;
  difficulty: number;
  tags: string[];
}

interface ProgressEvent {
  phase: string;
  status: string;
  summary?: string;
  questions?: Question[];
  error?: string;
  detail?: string;
  // 错误态增强：kind=错误大类（决定横幅图标/强调），errorPhase=失败节点
  kind?: ErrorKind;
  errorPhase?: string;
  failedDomains?: string[];
  round?: number;
  domain?: string;
  index?: number;
  total?: number;
  count?: number;
}

interface DomainProgress {
  domain: string;
  status: "running" | "success" | "failed";
  count?: number;
  index?: number;
  total?: number;
}

// ─── 常量 ───

const PHASE_LABEL: Record<string, string> = {
  analyzeResume: "分析简历",
  routeCandidate: "路由分流",
  planStrategy: "规划策略",
  generateQuestions: "生成题目",
  refine: "精炼优化",
};

// 失败节点标签（含校验题目；仅用于错误横幅副标题，不进进度行避免 happy path 多一行空 ⬜）
const ERROR_PHASE_LABEL: Record<string, string> = {
  analyzeResume: "分析简历",
  routeCandidate: "路由分流",
  planStrategy: "规划策略",
  generateQuestions: "生成题目",
  validateQuestions: "校验题目",
  refine: "精炼优化",
  unknown: "未知阶段",
};

const PHASE_ORDER = ["analyzeResume", "routeCandidate", "planStrategy", "generateQuestions", "refine"];

// ─── 页面 ───

export default function AiGeneratePage() {
  const router = useRouter();

  // ── Key 管理 ──
  const [apiKey, setApiKey] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("ai_api_key") ?? "";
    return "";
  });
  const [keyConfigured, setKeyConfigured] = useState(!!apiKey);
  const [showKeySection, setShowKeySection] = useState(!apiKey);
  const [testingKey, setTestingKey] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState<"success" | "invalid" | "error" | null>(null);

  // ── 输入 ──
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");

  // ── 生成 ──
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [domainProgress, setDomainProgress] = useState<Record<string, DomainProgress>>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [failedDomains, setFailedDomains] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string; kind?: ErrorKind; phase?: string } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // 逐域渐进显示：记录已累加的题目数，用于给增量题目计算出在 questions 数组里的正确下标
  const questionCountRef = useRef(0);

  const completedPhases = new Set(
    progress.filter((e) => e.status === "done").map((e) => e.phase)
  );

  const donePhaseCount = PHASE_ORDER.filter((p) => completedPhases.has(p)).length;
  const activePhase = PHASE_ORDER.find(
    (p) => progress.some((e) => e.phase === p) && !completedPhases.has(p)
  );
  const fillPct = Math.round(
    ((donePhaseCount + (activePhase ? 0.5 : 0)) / PHASE_ORDER.length) * 100
  );

  // ── Key 操作 ──

  const handleTestKey = async () => {
    if (!apiKey.trim()) return;
    setTestingKey(true);
    setKeyTestResult(null);
    try {
      await fetch("/api/ai/setup-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const res = await fetch("/api/ai/test", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setKeyTestResult("success");
        setKeyConfigured(true);
        localStorage.setItem("ai_api_key", apiKey);
      } else {
        setKeyTestResult("invalid");
      }
    } catch {
      setKeyTestResult("error");
    } finally {
      setTestingKey(false);
    }
  };

  // ── 生成 ──

  const handleGenerate = useCallback(async () => {
    if (!resume.trim()) return;
    setIsGenerating(true);
    setError(null);
    setCancelled(false);
    setProgress([]);
    setQuestions([]);
    questionCountRef.current = 0;
    setSelectedQuestions(new Set());
    setFailedDomains([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await fetch("/api/ai/setup-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
        signal: controller.signal,
      });

      // 截图专用：URL 带 ?shoot=partial 或 localStorage.shoot_partial=1 时，向前端生成请求注入
      // forcePartial 标记，由路由透传给工作流强制「第一个知识域」失败，以稳定复现「域级部分失败琥珀条」。
      const forcePartial = typeof window !== "undefined" && (
        new URLSearchParams(window.location.search).get("shoot") === "partial" ||
        window.localStorage.getItem("shoot_partial") === "1"
      );
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: resume.trim(), jd: jd.trim(), forcePartial }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error("请求失败");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event: ProgressEvent = JSON.parse(line.slice(6));
          setProgress((prev) => [...prev, event]);
          if (event.phase === "domain" && event.domain) {
            const domain = event.domain;
            // 域级失败即时累计进 failedDomains：节点④ 域陆续跑，失败域的 domain/failed 事件
            // 会在生成中途就到达（早于 generateQuestions/done 事件）。即便后续长 SSE 因网络/代理被掐断，
            // 失败域已记录，生成结束（isGenerating=false）后琥珀条即可渲染。这是更稳健、也更贴近真实
            // 部分失败语义的做法（失败域无需等整轮跑完才汇总）。
            if (event.status === "failed") {
              setFailedDomains((prev) => (prev.includes(domain) ? prev : [...prev, domain]));
            }
            setDomainProgress((prev) => ({
              ...prev,
              [domain]: {
                domain,
                status: event.status as DomainProgress["status"],
                count: event.count,
                index: event.index,
                total: event.total,
              },
            }));
            // 逐域渐进显示：域成功时把该域题目增量追加进列表（5 路并发，域陆续完成 → 题目逐个域冒出）
            if (event.status === "success" && event.questions && event.questions.length > 0) {
              const start = questionCountRef.current;
              questionCountRef.current += event.questions.length;
              setQuestions((prev) => [...prev, ...event.questions!]);
              setSelectedQuestions((prev) => {
                const next = new Set(prev);
                event.questions!.forEach((_, i) => next.add(start + i));
                return next;
              });
            }
          }
          if (event.phase === "generateQuestions") {
            if (event.questions) {
              setQuestions(event.questions);
              setSelectedQuestions(new Set(event.questions.map((_, i) => i)));
            }
            if (event.failedDomains && event.failedDomains.length > 0) {
              setFailedDomains(event.failedDomains);
            }
          }
          if (event.phase === "done") {
            if (event.questions) setQuestions(event.questions);
            setFailedDomains(event.failedDomains ?? []);
          }
          if (event.phase === "error") {
            setError({
              title: event.error ?? "生成失败",
              detail: event.detail ?? "",
              kind: event.kind,
              phase: event.errorPhase,
            });
            // Key 类错误：自动展开 Key 输入区，引导用户去检查 / 更换 Key
            if (event.kind === "key") {
              setShowKeySection(true);
              setKeyConfigured(false);
            }
          }
        }
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setCancelled(true);
        setProgress([]);
        setQuestions([]);
        setSelectedQuestions(new Set());
        setDomainProgress({});
      } else {
        setError({ title: "生成失败", detail: e instanceof Error ? e.message : "", kind: "unknown" });
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  }, [resume, jd, apiKey]);

  // ── 取消生成（二次确认，避免误触立即断流） ──

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleCancel = () => setShowCancelConfirm(true);

  const confirmCancel = () => {
    setShowCancelConfirm(false);
    abortRef.current?.abort();
  };

  // ── 题目选择 ──

  const toggleQuestion = (index: number) => {
    setSelectedQuestions((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  };

  // ── 保存 ──

  const handleSave = async () => {
    const toSave = questions.filter((_, i) => selectedQuestions.has(i));
    if (toSave.length === 0) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/ai/save-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: toSave }),
      });
      const data = await res.json();
      if (data.ok) {
        router.push(`/?toast=已保存 ${data.savedCount} 道AI生成题目`);
      } else {
        setError({ title: "保存失败", detail: data.error ?? "" });
      }
    } catch {
      setError({ title: "保存失败", detail: "" });
    } finally {
      setIsSaving(false);
    }
  };

  const canGenerate = keyConfigured && resume.trim().length > 0 && !isGenerating;

  // ── 渲染 ──

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">AI 出题</h1>

      {/* 错误横幅（按 kind 分化图标，副标题显示失败节点） */}
      {error && (
        <div
          className="mb-6 flex items-start justify-between gap-3 rounded-lg border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <div className="flex items-start gap-2">
            <span className="text-base leading-5">{ERROR_KIND_ICON[error.kind ?? "unknown"]}</span>
            <div>
              <p className="font-medium">{error.title}</p>
              {error.detail && <p className="mt-0.5 text-xs opacity-90">{error.detail}</p>}
              {error.phase && (
                <p className="mt-0.5 text-xs opacity-80">
                  失败阶段：{ERROR_PHASE_LABEL[error.phase] ?? error.phase}
                </p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-white" onClick={handleGenerate}>
            重新生成
          </Button>
        </div>
      )}

      {/* 取消二次确认覆盖层 */}
      {showCancelConfirm && isGenerating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm border-border bg-card p-6 shadow-lg">
            <h3 className="text-base font-semibold text-foreground">确认取消生成？</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              取消后正在进行的出题会立即中断，已生成的题目将被丢弃，且不再消耗更多 token。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="outline" size="sm" onClick={() => setShowCancelConfirm(false)}>
                继续生成
              </Button>
              <Button variant="destructive" size="sm" onClick={confirmCancel}>
                确认取消
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* 已取消提示 */}
      {cancelled && !isGenerating && !error && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <span>已取消生成。</span>
          <Button variant="outline" size="sm" className="shrink-0 border-primary text-primary hover:bg-primary hover:text-white" onClick={handleGenerate}>
            重新生成
          </Button>
        </div>
      )}

      {/* 部分失败提示条（琥珀色） */}
      {failedDomains.length > 0 && questions.length > 0 && (
        <div className="mb-6 rounded-lg border border-warning bg-warning-soft px-4 py-3 text-sm text-foreground">
          以下知识域生成失败：{failedDomains.join("、")}
          （可重新生成，或手动补充题目）
        </div>
      )}

      {/* Key 管理区 */}
      <Card className="mb-6">
        {keyConfigured && !showKeySection ? (
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="text-sm text-muted-foreground">DeepSeek · 已连接</span>
            <button
              onClick={() => setShowKeySection(true)}
              className="text-xs text-primary hover:underline"
            >
              更换 Key
            </button>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">DeepSeek API Key</span>
              {keyConfigured && (
                <button
                  onClick={() => setShowKeySection(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  收起
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setKeyConfigured(false);
                  setKeyTestResult(null);
                }}
                placeholder="sk-..."
                className="flex-1"
              />
              <Button onClick={handleTestKey} disabled={testingKey || !apiKey.trim()} className="whitespace-nowrap">
                {testingKey ? "测试中…" : "测试连接"}
              </Button>
            </div>
            {keyTestResult === "success" && <p className="text-xs text-success">连接成功</p>}
            {keyTestResult === "invalid" && <p className="text-xs text-destructive">API Key 无效</p>}
            {keyTestResult === "error" && <p className="text-xs text-destructive">连接失败，请检查网络</p>}
            <p className="text-xs text-muted-foreground">
              Key 会发送至你的后端，加密后存入 Cookie 用于调用 DeepSeek；不写入数据库，前端 JS 无法读取。{" "}
              <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                如何获取？
              </a>
            </p>
          </div>
        )}
      </Card>

      {/* 输入区 */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            简历内容 <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={resume}
            onChange={(e) => setResume(e.target.value)}
            placeholder="粘贴你的简历文本…"
            rows={6}
            disabled={isGenerating}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            目标岗位 JD
            <span className="ml-1 text-xs text-muted-foreground">选填，填写后出题更精准</span>
          </label>
          <Textarea
            value={jd}
            onChange={(e) => setJd(e.target.value)}
            placeholder="粘贴目标岗位的职位描述…"
            rows={4}
            disabled={isGenerating}
          />
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={isGenerating ? handleCancel : handleGenerate}
          disabled={!isGenerating && !canGenerate}
        >
          {isGenerating ? "取消生成" : "开始分析出题"}
        </Button>
      </div>

      {/* 生成进度 */}
      {progress.length > 0 && (
        <Card className="mb-6 space-y-2.5 p-4">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">生成进度</h2>
            <span className="text-xs text-muted-foreground">
              {fillPct}% · 阶段 {donePhaseCount + (activePhase ? 1 : 0)}/{PHASE_ORDER.length}
            </span>
          </div>
          <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${fillPct}%` }} />
          </div>
          {PHASE_ORDER.map((phase) => {
            const done = completedPhases.has(phase);
            const active = progress.some((e) => e.phase === phase) && !done;
            const generatingDomains = phase === "generateQuestions" && !done && Object.keys(domainProgress).length > 0;
            const isActive = active || generatingDomains;
            const isFailedPhase = !!error?.phase && error.phase === phase;
            const summary = progress.find((e) => e.phase === phase)?.summary;
            return (
              <div key={phase}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center text-xs">
                    {isFailedPhase ? "❌" : done ? "✅" : isActive ? "⏳" : "⬜"}
                  </span>
                  <span className={isFailedPhase ? "text-destructive" : done ? "text-foreground" : "text-muted-foreground"}>
                    {PHASE_LABEL[phase]}
                  </span>
                  {summary && <span className="truncate text-xs text-muted-foreground">· {summary}</span>}
                </div>
                {phase === "generateQuestions" && Object.keys(domainProgress).length > 0 && (
                  <div className="ml-7 mt-1.5 space-y-1">
                    {Object.values(domainProgress).map((d) => (
                      <div key={d.domain} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{d.status === "running" ? "⏳" : d.status === "success" ? "✅" : "❌"}</span>
                        <span className="text-foreground">{d.domain}</span>
                        {d.status === "running" && d.index != null && d.total != null && (
                          <span>· 域 {d.index}/{d.total}</span>
                        )}
                        {d.status === "success" && d.count != null && <span>· {d.count} 题</span>}
                        {d.status === "failed" && <span className="text-destructive">· 生成失败</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* 题目预览与审核 */}
      {questions.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">题目审核</h2>
            <span className="text-sm text-muted-foreground">
              {selectedQuestions.size} / {questions.length} 道选中
            </span>
          </div>

          {questions.map((q, i) => {
            const selected = selectedQuestions.has(i);
            return (
              <Card
                key={i}
                className={"space-y-2 p-4 transition-all " + (selected ? "border-primary shadow-sm" : "border-border opacity-50")}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ color: difficultyColor(q.difficulty), background: "hsl(var(--muted))" }}
                  >
                    {difficultyLabel(q.difficulty)}（{q.difficulty}）
                  </span>
                  {q.tags.map((tag) => (
                    <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>

                <h3 className="text-base font-semibold text-foreground">{q.title}</h3>

                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{q.content}</p>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleQuestion(i)}
                  className={
                    selected
                      ? "border-destructive text-destructive hover:bg-destructive/10"
                      : "border-success text-success hover:bg-success/10"
                  }
                >
                  {selected ? "删除此题" : "保留此题"}
                </Button>
              </Card>
            );
          })}

          <Button className="w-full" onClick={handleSave} disabled={selectedQuestions.size === 0 || isSaving}>
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                保存中…
              </span>
            ) : (
              `确认保存 ${selectedQuestions.size} 道题到题库`
            )}
          </Button>
        </div>
      )}

      {/* 空态 */}
      {!isGenerating && progress.length === 0 && !error && !cancelled && (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            粘贴你的简历，AI 将为你的经历定制面试题目。
          </p>
        </div>
      )}
    </main>
  );
}
