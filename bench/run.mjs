// 실험 실행 — 모델 × 조건 × 반복 × 질문마다 빈 폴더에서 Claude Code에 질문 하나를 주고 정답과 비교한다.
//
// 사용법:
//   node bench/run.mjs                                     # 전체 (모델 2 × 조건 4 × 질문 30 × 1회)
//   node bench/run.mjs --models sonnet --conditions spec --questions Q01,Q17
//   node bench/run.mjs --reps 3 --concurrency 4 --effort medium
//
// 결과: runs/<runId>/results.jsonl, runs/<runId>/<model>/<condition>/rep<n>/<qid>/

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONDITIONS, DEFAULT_EFFORT, MODELS, claudeMd, prompt } from './conditions.mjs';
import { isCorrect } from './grade.mjs';
import { QUESTIONS } from '../hidden/questions.mjs';
import { goldAnswers } from '../hidden/answers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'data/hr.db');
const CLAUDE_TIMEOUT_MS = 6 * 60 * 1000;

// ---- 인자 ----
function parseArgs(argv) {
  const opts = {
    models: Object.keys(MODELS),
    conditions: Object.keys(CONDITIONS),
    questions: QUESTIONS.map((q) => q.id),
    effort: DEFAULT_EFFORT,
    reps: 1,
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (key === '--models') opts.models = value.split(',');
    else if (key === '--conditions') opts.conditions = value.split(',');
    else if (key === '--questions') opts.questions = value.split(',');
    else if (key === '--effort') opts.effort = value;
    else if (key === '--reps') opts.reps = Number(value);
    else if (key === '--concurrency') opts.concurrency = Number(value);
    else throw new Error(`알 수 없는 인자: ${key}`);
  }
  for (const c of opts.conditions) if (!CONDITIONS[c]) throw new Error(`알 수 없는 조건: ${c}`);
  for (const m of opts.models) if (!MODELS[m]) throw new Error(`알 수 없는 모델: ${m}`);
  for (const q of opts.questions) if (!QUESTIONS.some((x) => x.id === q)) throw new Error(`알 수 없는 질문: ${q}`);
  return opts;
}

// ---- 프로세스 실행 ----
// Claude Code 안에서 이 스크립트를 돌리면 부모 세션의 변수가 자식 claude로 넘어가 API 오류가 난다
const PARENT_SESSION_VARS = ['ANTHROPIC_BASE_URL', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'];

function exec(cmd, args, { cwd, timeoutMs }) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const v of PARENT_SESSION_VARS) delete env[v];
    const child = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut: signal === 'SIGKILL' });
    });
  });
}

// ---- 작업 폴더 준비 ----
// 저장소 밖 임시 폴더에 질문마다 새로 만든다. hidden/ 은 볼 수 없고, 이전 질문의 흔적도 없다.
async function prepareWorkdir(condition) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `hr-${condition}-`));
  await fs.copyFile(path.join(ROOT, 'task/TASK.md'), path.join(dir, 'TASK.md'));
  await fs.copyFile(DB, path.join(dir, 'hr.db'));
  await fs.chmod(path.join(dir, 'hr.db'), 0o444);
  for (const f of CONDITIONS[condition]) await fs.copyFile(path.join(ROOT, 'knowledge', f), path.join(dir, f));
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), claudeMd(CONDITIONS[condition]));
  return dir;
}

// ---- Claude Code 실행 ----
async function runClaude({ model, effort, question, cwd }) {
  const args = [
    '-p', prompt(question),
    '--model', MODELS[model],
    ...(effort === 'default' ? [] : ['--effort', effort]),
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'dontAsk',
    '--allowedTools', 'Read', 'Write', 'Glob', 'Grep', 'Bash(sqlite3:*)',
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--no-session-persistence',
  ];
  const started = Date.now();
  const res = await exec('claude', args, { cwd, timeoutMs: CLAUDE_TIMEOUT_MS });
  const events = res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const out = events.findLast((e) => e.type === 'result') ?? null;
  const toolUses = events
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => e.message?.content ?? [])
    .filter((c) => c.type === 'tool_use').length;
  return {
    res,
    stats: {
      costUsd: out?.total_cost_usd ?? null,
      durationMs: out?.duration_ms ?? Date.now() - started,
      turns: out?.num_turns ?? null,
      inputTokens: out?.usage
        ? (out.usage.input_tokens ?? 0) + (out.usage.cache_read_input_tokens ?? 0) + (out.usage.cache_creation_input_tokens ?? 0)
        : null,
      outputTokens: out?.usage?.output_tokens ?? null,
      thinkingTokens: out?.usage?.output_tokens_details?.thinking_tokens ?? null,
      toolUses,
      permissionDenials: out?.permission_denials?.length ?? null,
      modelIds: out?.modelUsage ? Object.keys(out.modelUsage) : [],
      claudeError: out ? Boolean(out.is_error) : true,
      claudeTimedOut: res.timedOut,
    },
  };
}

const answered = (reply) => reply !== null && typeof reply === 'object' && 'answer' in reply;

// ---- 한 번 실행 (질문 하나) ----
async function runOne({ runDir, gold, model, condition, effort, rep, q }) {
  const rel = path.join(model, condition, `rep${rep}`, q.id);
  const outDir = path.join(runDir, rel);
  await fs.mkdir(outDir, { recursive: true });

  const work = await prepareWorkdir(condition);
  const { res, stats } = await runClaude({ model, effort, question: q.question, cwd: work });
  await fs.writeFile(path.join(outDir, 'transcript.jsonl'), res.stdout || '');
  if (res.stderr) await fs.writeFile(path.join(outDir, 'stderr.txt'), res.stderr);

  let reply = null;
  try {
    reply = JSON.parse(await fs.readFile(path.join(work, 'answer.json'), 'utf8'));
  } catch {}
  if (reply) await fs.writeFile(path.join(outDir, 'answer.json'), JSON.stringify(reply, null, 2));
  await fs.rm(work, { recursive: true, force: true });

  const result = {
    model,
    condition,
    effort,
    rep,
    qid: q.id,
    tier: q.tier,
    dir: rel,
    answered: answered(reply),
    correct: answered(reply) && isCorrect(q.shape, reply.answer, gold[q.id]),
    answer: reply?.answer ?? null,
    gold: gold[q.id],
    sql: reply?.sql ?? null,
    ...stats,
  };
  await fs.appendFile(path.join(runDir, 'results.jsonl'), JSON.stringify(result) + '\n');

  const label = `${model}/${condition}/rep${rep}/${q.id}`;
  const cost = result.costUsd == null ? '-' : `$${result.costUsd.toFixed(3)}`;
  console.log(`${label.padEnd(32)} ${result.correct ? 'O' : 'X'}  ${cost}  ${(result.durationMs / 1000).toFixed(0)}s  turns ${result.turns ?? '-'}`);
  return result;
}

// ---- 메인 ----
const opts = parseArgs(process.argv.slice(2));
const gold = goldAnswers(DB);
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const runDir = path.join(ROOT, 'runs', runId);
await fs.mkdir(runDir, { recursive: true });
await fs.writeFile(path.join(runDir, 'config.json'), JSON.stringify(opts, null, 2));

const jobs = [];
for (let rep = 1; rep <= opts.reps; rep++)
  for (const model of opts.models)
    for (const condition of opts.conditions)
      for (const q of QUESTIONS.filter((x) => opts.questions.includes(x.id)))
        jobs.push({ runDir, gold, model, condition, effort: opts.effort, rep, q });

console.log(`runId ${runId} — ${jobs.length}회 실행 (동시 ${opts.concurrency}, effort ${opts.effort})`);
let next = 0;
await Promise.all(
  Array.from({ length: opts.concurrency }, async () => {
    while (next < jobs.length) await runOne(jobs[next++]);
  }),
);
console.log(`완료 → node bench/report.mjs ${runId}`);
