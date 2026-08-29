// Interview Forge · AI 出题流程截图脚本
// 浅色跑完整 + 深色跑完整 + 错误态，全部真实跑 DeepSeek
// 真实跑生成的题通过 save-questions 写入数据库（用户已确认全部保留）
// 用法：node scripts/screenshot-ai.mjs [phase] [阶段列表]
//   phase = all | light | dark | error | partial | phases
//   phases：局部重截指定阶段（双主题，一次流程出 light+dark）
//     例：node scripts/screenshot-ai.mjs phases planStrategy,generateQuestions

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:3200';
const OUT_DIR = '/Users/nzmin/WorkBuddy/AI/interview-forge/docs/screenshots';
const INPUT_PATH = '/Users/nzmin/WorkBuddy/AI/interview-forge/docs/screenshots/screenshot-input.md';
const ENV_PATH = '/Users/nzmin/WorkBuddy/AI/interview-forge/.env';

// ── 加载素材 ──
const input = fs.readFileSync(INPUT_PATH, 'utf-8');
const resumeMatch = input.match(/## === 简历开始 ===\n([\s\S]*?)\n## === 简历结束 ===/);
const jdMatch = input.match(/## === JD 开始[^\n]*\n([\s\S]*?)\n## === JD 结束 ===/);
const RESUME = resumeMatch[1].trim();
const JD = jdMatch[1].trim();
console.log(`✓ 简历 ${RESUME.length} 字符 / JD ${JD.length} 字符`);

// ── 读 API Key（不打印值） ──
const env = fs.readFileSync(ENV_PATH, 'utf-8');
const keyMatch = env.match(/^DEEPSEEK_API_KEY=(.+)$/m);
const DEEPSEEK_API_KEY = keyMatch ? keyMatch[1].trim() : null;
if (!DEEPSEEK_API_KEY) {
  console.error('✗ DEEPSEEK_API_KEY 未在 .env 找到');
  process.exit(1);
}
console.log(`✓ DeepSeek API Key: ${DEEPSEEK_API_KEY.slice(0, 6)}... 已加载`);

// ── 启动浏览器 ──
// 必须禁用代理：本机环境残留 HTTPS_PROXY=127.0.0.1:65487（已死的隧道），Chromium 默认继承该 env
// 把 localhost:3200 的 SSE 长连接（~5min）也路由进死代理 → 流被掐断、浏览器端 reader 抛错 →
// 页面显示「生成失败」致命横幅（Node 直连 client 则正常）。--no-proxy-server 让 Chromium 完全忽略
// 系统/ENV 代理，直连 localhost，是比 `proxy:{server:'direct://'}` 更稳的写法（后者该 Playwright 版本不认）。
const browser = await chromium.launch({
  args: ['--no-proxy-server', '--proxy-bypass-list=*'],
  env: { ...process.env, HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '', ALL_PROXY: '', all_proxy: '', NO_PROXY: '*' },
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
// middleware 全站门禁：带 site_auth=1 cookie 才能访问 /ai-generate（否则被重定向到 /unlock）
await context.addCookies([{ name: 'site_auth', value: '1', url: BASE }]);
const page = await context.newPage();

// ── helpers ──
async function setTheme(theme) {
  await page.evaluate((t) => {
    localStorage.setItem('theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, theme);
  await page.waitForTimeout(500);
}

async function shot(name, opts = {}) {
  if (opts.theme) await setTheme(opts.theme);
  if (opts.waitFor) await page.waitForSelector(opts.waitFor, { timeout: 30000 });
  if (opts.waitMs) await page.waitForTimeout(opts.waitMs);
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  ✓ ${name}.png`);
}

async function visitAiPage() {
  await page.goto(`${BASE}/ai-generate`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
}

async function inputKeyAndConnect(key = DEEPSEEK_API_KEY) {
  // 清掉旧的 ai_api_key，强制走输入流程
  await page.evaluate(() => localStorage.removeItem('ai_api_key'));
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('input[type="password"]', { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.locator('input[type="password"]').fill(key);
  await page.click('button:has-text("测试连接")');
  await page.waitForSelector('text=连接成功', { timeout: 30000 });
  await page.waitForTimeout(500);
}

// 阶段标签（与页面 PHASE_LABEL 一致）
const PHASE_LABELS = {
  analyzeResume: '分析简历',
  routeCandidate: '路由分流',
  planStrategy: '规划策略',
  generateQuestions: '生成题目',
  refine: '精炼优化',
};

// ── 阶段「可辨识视觉证据」——解决同帧重复问题 ──
// 背景：SSE 顶层阶段只在节点完成时推 done（streamMode:"values"），而节点④一开始就会给每个域
// 推 domain running。于是 planStrategy 打 ✅ 与 generateQuestions 转 ⏳ + 涌入域进度几乎同时发生，
// 「生成题目仍是 ⬜」那一帧只存在几十毫秒，轮询 + 整页截图根本抓不住 → 两张图 MD5 完全相同。
// 修法：不追求抓不到的那一帧，改为抓两个真实存在、且肉眼可分的状态：
//   planStrategy      = 域进度刚涌入、尚无域完成（全是 ⏳ running）
//   generateQuestions = 已有若干域完成（出现 ✅ · n 题）
const ROW_SEL = '[class*="ml-7"] > div'; // 生成进度卡片里域列表容器的直接子行

function rowStats(rows) {
  const done = rows.filter((t) => /\d+\s*题/.test(t)).length;
  const failed = rows.filter((t) => t.includes('生成失败')).length;
  return { total: rows.length, done, failed };
}

const PHASE_EVIDENCE = {
  planStrategy: {
    desc: '域进度刚出现，尚无域完成（全 ⏳）',
    mode: 'domainsRunning',
    timeoutMs: 120000,
  },
  generateQuestions: {
    desc: '已有域完成（出现 ✅ · n 题）',
    mode: 'domainsDone',
    timeoutMs: 420000,
  },
};

// 等到目标阶段出现专属视觉证据（或流程已到终态）才返回。
// minDone：generateQuestions 要求「完成域数」至少比 planStrategy 那帧多 2，
// 保证两帧必然不同（否则并发跑完 10 个域时可能刚好是同一画面）。
async function waitForEvidence(phaseKey, minDone = 0) {
  const cfg = PHASE_EVIDENCE[phaseKey];
  if (!cfg) return;
  console.log(`    ↳ 等待 ${phaseKey} 的可辨识证据：${cfg.desc}`);
  const t0 = Date.now();
  while (Date.now() - t0 < cfg.timeoutMs) {
    const st = await page.evaluate(
      ({ sel, genLabel }) => {
        const rows = Array.from(document.querySelectorAll(sel)).map((el) =>
          (el.textContent || '').trim()
        );
        // 真正的终态 = 顶层「生成题目」阶段打 ✅（节点④全部跑完才推 done）。
        // 注意：不能拿「题目审核区出现」当终态——题目是逐域累加渲染的，
        // 第一个域一完成它就会出现，那时后面还有 9 个域在跑。
        let genDone = false;
        let fatal = false;
        for (const span of document.querySelectorAll('span')) {
          const t = (span.textContent || '').trim();
          if (t !== genLabel) continue;
          const icon = span.closest('div')?.querySelector('span')?.textContent || '';
          genDone = icon.includes('✅');
        }
        fatal = !!Array.from(document.querySelectorAll('button')).find((b) =>
          (b.textContent || '').includes('重新生成')
        );
        return { rows, genDone, fatal };
      },
      { sel: ROW_SEL, genLabel: PHASE_LABELS.generateQuestions }
    );
    if (st.genDone || st.fatal) {
      console.log('    · 生成阶段已结束，停止等待');
      return;
    }
    const s = rowStats(st.rows);
    const ok =
      cfg.mode === 'domainsRunning'
        ? s.total >= 1 && s.done === 0
        : s.done >= Math.max(3, minDone);
    if (ok) {
      console.log(`    ✓ 证据达成（域行 ${s.total} 行 · 完成 ${s.done} · 失败 ${s.failed}）`);
      return;
    }
    await page.waitForTimeout(1000);
  }
  console.log(`    ⚠ 等待 ${phaseKey} 证据超时，按当前画面截`);
}

// 读取当前画面里「已完成的域数」（域行含「n 题」即完成）
async function readDoneRows() {
  const rows = await page.evaluate((sel) =>
    Array.from(document.querySelectorAll(sel)).map((el) => (el.textContent || '').trim())
  , ROW_SEL);
  return rowStats(rows).done;
}

async function runFullFlow(theme, suffix) {
  console.log(`\n──── AI 出题 · 主题 ${theme} · ${suffix} ────`);
  await visitAiPage();
  await setTheme(theme);

  // 1) 空闲态（key 未配置 + 表单空）
  await shot(`ai__idle__${theme}__${suffix}`, { waitMs: 300 });

  // 2) 配置 key（输入真实 key → 测试连接）
  await inputKeyAndConnect();
  await shot(`ai__key-connected__${theme}__${suffix}`);

  // 3) 填简历 + JD
  await page.locator('textarea').first().fill(RESUME);
  await page.locator('textarea').nth(1).fill(JD);
  await page.waitForTimeout(500);
  await shot(`ai__form-filled__${theme}__${suffix}`);

  // 4) 触发生成
  await page.click('button:has-text("开始分析出题")');

  // 5) 轮询 phase 推进
  const captured = new Set();
  const startTime = Date.now();
  const timeoutMs = 720000; // 12 分钟（真实简历全流程实测 ~5min，留足余量；勿低于 6min 否则流程未跑完就被断开）
  let lastPhase = null;
  let successReached = false;
  let errorReached = false;

  while (Date.now() - startTime < timeoutMs) {
    const state = await page.evaluate((PHASE_LABELS) => {
      // 致命红横幅：border-destructive 且 bg-destructive（含「重新生成」按钮）
      const errorEls = Array.from(document.querySelectorAll('div'));
      const fatalEl = errorEls.find(el =>
        el.className.includes('border-destructive') &&
        el.className.includes('bg-destructive')
      );
      const fatalText = fatalEl ? (fatalEl.textContent || '') : '';
      const hasRetryBtn = !!Array.from(document.querySelectorAll('button'))
        .find(b => (b.textContent || '').includes('重新生成'));
      const isPartial = /以下知识域生成失败/.test(fatalText);
      const hasError = !!fatalEl && hasRetryBtn && !isPartial &&
        /生成失败|响应超时|调用失败|API 调用|鉴权|请求失败|网络|超时/.test(fatalText);
      const hasQuestions = !!Array.from(document.querySelectorAll('h2'))
        .find(h => h.textContent?.trim() === '题目审核');
      const fillPct = document.querySelector('[style*="width"]')?.style?.width || '';
      const errorTitle = fatalText.split(/[：:]/)[0]?.trim();
      // 阶段状态：遍历页面上 PHASE_LABELS 对应的 label span，读取其左侧图标（✅/⏳/⬜）
      // 关键：SSE 顶层阶段只在「完成」时推 done 事件（除 refine 有 running），故 analyzeResume/路由分流/
      // 规划策略 直接 ⬜→✅，不会停留 ⏳；generateQuestions 因 generatingDomains 在生成中显示 ⏳，
      // refine 在重出轮显示 ⏳。因此「阶段进展」须同时捕捉 done(✅) 与 active(⏳) 的首次出现。
      const donePhases = [];
      let activePhase = null;
      for (const span of document.querySelectorAll('span')) {
        const t = (span.textContent || '').trim();
        const key = Object.keys(PHASE_LABELS).find(k => PHASE_LABELS[k] === t);
        if (!key) continue;
        const flex = span.closest('div');
        const icon = flex?.querySelector('span')?.textContent || '';
        if (icon.includes('✅')) donePhases.push(key);
        else if (icon.includes('⏳')) activePhase = key;
      }
      return { hasError, hasQuestions, fillPct, activePhase, donePhases, errorTitle, errorDetail: fatalText };
    }, PHASE_LABELS);

    // 终态优先：题目审核区（h2「题目审核」）已出现 = 题目已生成完成。
    // 注意：fillPct 到 100% 仅在发生 refine 重出轮时才成立；干净完成时只有 4/5 阶段 done
    //（refine 阶段未出现）→ fillPct=80%，故绝不能用 fillPct===100% 判定成功，否则会 12 分钟超时。
    if (state.hasQuestions) {
      await page.waitForTimeout(1500);
      await shot(`ai__success__${theme}__${suffix}`);
      successReached = true;
      break;
    }

    if (state.hasError) {
      console.log(`  ✗ 错误态触发：${state.errorDetail?.slice(0, 200)}`);
      await shot(`ai__error__${theme}__${suffix}`);
      errorReached = true;
      break;
    }

    // 截阶段进展：done(✅) 或 active(⏳) 首次出现都算一次进展。
    // 用 for 循环逐个补拍，避免「同一次轮询内多个阶段一起完成」时只截到最后一个、漏掉前面的。
    const reached = state.activePhase
      ? [...new Set([...state.donePhases, state.activePhase])]
      : state.donePhases;
    for (const p of reached) {
      if (!captured.has(p)) {
        captured.add(p);
        // 同上：等到该阶段有专属视觉证据再截，避免与上一阶段同帧（MD5 相同）
        await waitForEvidence(p);
        await shot(`ai__phase-${p}__${theme}__${suffix}`);
        lastPhase = p;
      }
    }
    console.log(`    poll ${(Date.now() - startTime) / 1000 | 0}s · 阶段 ${reached.length}/5 · done=[${state.donePhases.join(',') || '-'}] active=${state.activePhase || '-'} 成功=${state.hasQuestions} 错误=${state.hasError}`);

    await page.waitForTimeout(800);
  }

  if (!successReached && !errorReached) {
    console.log(`  ⚠ 超时未到终态（可能仍在 generateQuestions 阶段）`);
    await shot(`ai__timeout__${theme}__${suffix}`);
  }

  return { successReached, errorReached };
}

// 只重截指定阶段的双主题图（一次流程出 light + dark，省一轮真实 API 调用与一次入库）。
// 用途：某几张阶段图出问题（同帧重复 / 画面不对）时局部重截，不动其它已确认干净的图。
// 用法：node scripts/screenshot-ai.mjs phases planStrategy,generateQuestions
async function runPhaseShots(phases) {
  console.log(`\n──── 重截阶段图 · ${phases.join(', ')} · 双主题 ────`);
  await visitAiPage();
  await setTheme('light');
  await inputKeyAndConnect();
  await page.locator('textarea').first().fill(RESUME);
  await page.locator('textarea').nth(1).fill(JD);
  await page.waitForTimeout(500);
  await page.click('button:has-text("开始分析出题")');

  const captured = new Set();
  let planDoneRows = 0; // 截 planStrategy 那帧时已完成的域数，用于给 generateQuestions 设下限
  const startTime = Date.now();
  const timeoutMs = 720000;

  while (Date.now() - startTime < timeoutMs && captured.size < phases.length) {
    const state = await page.evaluate((PHASE_LABELS) => {
      const donePhases = [];
      let activePhase = null;
      for (const span of document.querySelectorAll('span')) {
        const t = (span.textContent || '').trim();
        const key = Object.keys(PHASE_LABELS).find((k) => PHASE_LABELS[k] === t);
        if (!key) continue;
        const flex = span.closest('div');
        const icon = flex?.querySelector('span')?.textContent || '';
        if (icon.includes('✅')) donePhases.push(key);
        else if (icon.includes('⏳')) activePhase = key;
      }
      const fatalEl = Array.from(document.querySelectorAll('div')).find(
        (el) =>
          el.className.includes('border-destructive') && el.className.includes('bg-destructive')
      );
      const fatalText = fatalEl ? fatalEl.textContent || '' : '';
      const hasError =
        !!fatalEl &&
        !!Array.from(document.querySelectorAll('button')).find((b) =>
          (b.textContent || '').includes('重新生成')
        ) &&
        !/以下知识域生成失败/.test(fatalText);
      // 终态判定同样用「生成题目 ✅」而非「题目审核区出现」（后者第一个域完成就会出现）
      return {
        donePhases,
        activePhase,
        genDone: donePhases.includes('generateQuestions'),
        hasError,
        errorDetail: fatalText,
      };
    }, PHASE_LABELS);

    if (state.genDone) {
      console.log('  · 生成阶段已结束，停止');
      // 若还要求截 success，说明之前没截到；现在生成刚完成，补截双主题
      if (phases.includes('success') && !captured.has('success')) {
        await setTheme('light');
        await shot(`ai__success__light__real`);
        await setTheme('dark');
        await shot(`ai__success__dark__real`);
        await setTheme('light');
        captured.add('success');
        console.log('    ✓ success 已截 light + dark（生成完成态）');
      }
      break;
    }
    if (state.hasError) {
      console.log(`  ✗ 错误态触发：${state.errorDetail?.slice(0, 200)}`);
      break;
    }

    const reached = state.activePhase
      ? [...new Set([...state.donePhases, state.activePhase])]
      : state.donePhases;

    for (const p of phases) {
      if (captured.has(p) || !reached.includes(p)) continue;
      // generateQuestions 的完成域数必须比 planStrategy 那帧多 2，保证两帧必然不同
      const minDone = p === 'generateQuestions' ? planDoneRows + 2 : 0;
      // 等到该阶段有专属视觉证据，避免与上一阶段同帧
      await waitForEvidence(p, minDone);
      // 双主题：截完 light 切 dark 再截，最后切回 light 让流程不受影响
      await setTheme('light');
      await shot(`ai__phase-${p}__light__real`);
      await setTheme('dark');
      await shot(`ai__phase-${p}__dark__real`);
      await setTheme('light');
      if (p === 'planStrategy') planDoneRows = await readDoneRows();
      captured.add(p);
      console.log(`    ✓ ${p} 已截 light + dark（planDoneRows=${planDoneRows}）`);
    }

    await page.waitForTimeout(800);
  }

  const missed = phases.filter((p) => !captured.has(p));
  if (missed.length) console.log(`  ⚠ 未截到：[${missed.join(',')}]`);
  return [...captured];
}

async function runErrorFlow(theme) {
  console.log(`\n──── AI 出题 · 错误态 · ${theme} ────`);
  await visitAiPage();
  await setTheme(theme);

  // 1) Key 校验失败（7.9）：填无效 key → 点测试连接 → 钥匙区红字「API Key 无效」
  await page.evaluate(() => localStorage.removeItem('ai_api_key'));
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.locator('input[type="password"]').fill('sk-invalid-error-test-xxxxx');
  await page.click('button:has-text("测试连接")');
  await page.waitForSelector('text=API Key 无效', { timeout: 30000 });
  await page.waitForTimeout(500);
  await shot(`ai__error-key-invalid__${theme}`);

  // 2) 致命错误横幅（7.11）：注入无效 key 直接生成 → 🔑 密钥无效 + 失败节点副标题
  await page.evaluate(() => {
    localStorage.setItem('ai_api_key', 'sk-invalid-error-test-xxxxx');
  });
  await page.reload();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await setTheme(theme);
  await page.locator('textarea').first().fill(RESUME);
  await page.locator('textarea').nth(1).fill(JD);
  await page.waitForTimeout(500);
  await page.click('button:has-text("开始分析出题")');
  try {
    // 致命横幅必带「重新生成」按钮（key 类标题为「密钥无效或权限不足」）
    await page.waitForSelector('button:has-text("重新生成")', { timeout: 90000 });
    await page.waitForTimeout(500);
    await shot(`ai__error-banner__${theme}`);
    console.log(`  ✓ 致命横幅已截（key 类，带失败节点副标题）`);
  } catch {
    console.log(`  ⚠ 未触发致命横幅，截当前态`);
    await shot(`ai__error-banner__${theme}`);
  }
}

// 7.12 部分失败（域级琥珀条）：真实 Key 跑生成，捕捉「个别域失败、其余成功」的琥珀提示条。
// 注意：琥珀条只在生成结束（!isGenerating）且与题目并存时可见，故在生成完成后才截取。
async function runPartialFlow(theme) {
  console.log(`\n──── AI 出题 · 部分失败 · ${theme} ────`);
  // 不依赖 ?shoot=partial URL 参数（曾因 dev 重编译时序 / 重载竞态失效），改用 localStorage 标记：
  // 在「点击生成」之前显式写入 localStorage.shoot_partial=1，页面生成 handler 在点击时读取并注入
  // forcePartial 到请求体 → 路由透传 → 工作流强制第一个知识域失败 → 琥珀条。
  await page.goto(`${BASE}/ai-generate`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await setTheme(theme);
  await inputKeyAndConnect();
  await page.locator('textarea').first().fill(RESUME);
  await page.locator('textarea').nth(1).fill(JD);
  await page.waitForTimeout(500);
  // 点击生成前才注入标记（避免 inputKeyAndConnect 内部 reload 清除时序干扰），并清掉可能残留的旧标记先置位
  await page.evaluate(() => localStorage.setItem('shoot_partial', '1'));
  await page.click('button:has-text("开始分析出题")');

  const start = Date.now();
  const timeoutMs = 720000;
  let captured = false;
  while (Date.now() - start < timeoutMs) {
    const st = await page.evaluate(() => {
      const amber = Array.from(document.querySelectorAll('div')).find(
        (el) => el.className.includes('border-warning') && /以下知识域生成失败/.test(el.textContent || '')
      );
      const hasQuestions = !!Array.from(document.querySelectorAll('h2')).find(
        (h) => h.textContent?.trim() === '题目审核'
      );
      // 生成中：存在「生成中」/「停止生成」按钮
      const generating = !!Array.from(document.querySelectorAll('button')).find(
        (b) => (b.textContent || '').includes('生成中') || (b.textContent || '').includes('停止生成')
      );
      return { hasAmber: !!amber, hasQuestions, generating };
    });
    // 琥珀条渲染条件（page.tsx）：failedDomains.length>0 && questions.length>0。
    // 开发环境 SSE 长连接可能被代理掐断、isGenerating 不会翻 false，故不再要求 !generating——
    // 只要「琥珀条已出现」且「题目审核区已渲染」即可截（此时即为真实的域级部分失败态）。
    if (st.hasAmber && st.hasQuestions) {
      await page.waitForTimeout(500);
      await shot(`ai__error-partial__${theme}`);
      console.log(`  ✓ 部分失败琥珀条已截（与题目并存）`);
      captured = true;
      break;
    }
    // 生成已结束（保险分支）：再确认一次琥珀条
    if (st.hasQuestions && !st.generating) {
      await page.waitForTimeout(800);
      const stillAmber = await page.evaluate(() => !!Array.from(document.querySelectorAll('div')).find(
        (el) => el.className.includes('border-warning') && /以下知识域生成失败/.test(el.textContent || '')
      ));
      if (stillAmber) {
        await shot(`ai__error-partial__${theme}`);
        console.log(`  ✓ 部分失败琥珀条已截（生成结束态）`);
        captured = true;
      } else {
        console.log(`  · 完整成功（无部分失败），跳过`);
      }
      break;
    }
    await page.waitForTimeout(800);
  }
  if (!captured) console.log(`  ⚠ 本次未捕捉到部分失败（域全成功），error-partial 截图可能缺失`);
  // 清理标记，避免污染后续流程（light 跑完 dark 会重新置位）
  await page.evaluate(() => localStorage.removeItem('shoot_partial'));
}

const phase = process.argv[2] || 'all';

// ── dev 保活：dev 进程会被沙箱清理（idle 太久），自动重启 ──
async function ensureDev() {
  const { execSync } = await import('child_process');
  for (let i = 0; i < 5; i++) {
    try {
      execSync('lsof -iTCP:3200 -sTCP:LISTEN', { stdio: 'ignore' });
      // 监听中，再 fetch 一次确认能服务
      const r = await fetch(`${BASE}/`);
      if (r.ok) {
        console.log('✓ dev 在跑');
        return;
      }
    } catch {}
    console.log(`[dev-keepalive] 启动 dev (尝试 ${i + 1}/5)`);
    const { spawn } = await import('child_process');
    spawn(
      'bash',
      [
        '-c',
        `cd ${path.dirname(ENV_PATH)} && NO_PROXY=127.0.0.1,localhost PORT=3200 exec ./node_modules/.bin/next dev --port 3200`,
      ],
      { detached: true, stdio: 'ignore' }
    ).unref();
    await new Promise((r) => setTimeout(r, 9000));
  }
  throw new Error('dev 启动失败');
}

try {
  await ensureDev();
  if (phase === 'light' || phase === 'all') {
    const r1 = await runFullFlow('light', 'real');
    console.log(`浅色跑结果: success=${r1.successReached} error=${r1.errorReached}`);
  }
  if (phase === 'dark' || phase === 'all') {
    const r2 = await runFullFlow('dark', 'real');
    console.log(`深色跑结果: success=${r2.successReached} error=${r2.errorReached}`);
  }
  if (phase === 'error' || phase === 'all') {
    await runErrorFlow('light');
    await runErrorFlow('dark');
    await runPartialFlow('light');
    await runPartialFlow('dark');
  }
  if (phase === 'phases') {
    const list = (process.argv[3] || 'planStrategy,generateQuestions')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await runPhaseShots(list);
  }
  if (phase === 'partial') {
    await runPartialFlow('light');
    await runPartialFlow('dark');
  }
} catch (e) {
  console.error('✗ 异常:', e.message);
  await shot(`ai__EXCEPTION__${Date.now()}`);
  process.exit(1);
} finally {
  await browser.close();
  console.log('\n✓ 脚本结束');
}
