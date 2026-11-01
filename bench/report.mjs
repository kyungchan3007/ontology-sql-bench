// 결과표 — runs/<runId>/results.jsonl 을 모델 × 조건별로 묶는다.
//
// 사용법:
//   node bench/report.mjs            # 가장 최근 실행
//   node bench/report.mjs <runId>
//   node bench/report.mjs <runId> <runId> ...   # 여러 실행을 합쳐서 (예: 1회차 + 2 · 3회차). 표는 첫 runId 폴더에 저장
//
// 지표
//   정답률   맞힌 질문 / 전체 질문
//   등급별   simple · join · rule · trap 정답률
//   pass^k   반복이 k회일 때, k회 모두 맞힌 질문의 비율 (k = 반복 수)
//   비용     질문 1개당 평균 · 전체 합

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONDITIONS, MODELS } from './conditions.mjs';
import { QUESTIONS } from '../hidden/questions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = path.join(ROOT, 'runs');

const runIds = process.argv.length > 2 ? process.argv.slice(2) : [(await fs.readdir(RUNS)).filter((d) => !d.startsWith('.')).sort().at(-1)];
if (!runIds[0]) throw new Error('runs/ 에 실행 결과가 없습니다');
const runId = runIds.join(' + ');
const runDir = path.join(RUNS, runIds[0]);
const rows = [];
for (const id of runIds)
  for (const l of (await fs.readFile(path.join(RUNS, id, 'results.jsonl'), 'utf8')).trim().split('\n'))
    rows.push({ harness: 'default', ...JSON.parse(l) });

const TIERS = ['simple', 'join', 'rule', 'trap'];
const mean = (xs) => {
  const v = xs.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const total = (xs) => xs.filter((x) => x != null).reduce((a, b) => a + b, 0);
const pct = (x) => (x == null ? '-' : `${(x * 100).toFixed(0)}%`);
const rate = (g) => (g.length ? g.filter((r) => r.correct).length / g.length : null);

const order = (list, key) => [...list, ...rows.map((r) => r[key])].filter((v, i, a) => a.indexOf(v) === i);
const groups = [];
for (const harness of order(['default', 'lean'], 'harness'))
  for (const model of order(Object.keys(MODELS), 'model'))
    for (const condition of order(Object.keys(CONDITIONS), 'condition')) {
      const g = rows.filter((r) => r.harness === harness && r.model === model && r.condition === condition);
      if (g.length) groups.push({ harness, model, condition: harness === 'lean' ? `${condition} (lean)` : condition, g });
    }

const reps = Math.max(...rows.map((r) => r.rep));
const effort = [...new Set(rows.map((r) => r.effort))].join(', ');
const lines = [`# 결과 — ${runId}`, '', `- effort: ${effort}`, `- 반복: ${reps}회`, `- 질문: ${new Set(rows.map((r) => r.qid)).size}개`, ''];

// ---- 요약 ----
lines.push(`| 모델 | 조건 | 정답률 | pass^${reps} | 질문당 비용 | 질문당 시간 | 턴 | 합계 비용 |`, '|---|---|---:|---:|---:|---:|---:|---:|');
for (const { model, condition, g } of groups) {
  const byQ = Object.groupBy(g, (r) => r.qid);
  // 그룹 안의 반복 수가 reps보다 적으면 pass^reps를 계산하지 않는다
  const full = Object.values(byQ).every((rs) => rs.length === reps);
  const allOk = full ? Object.values(byQ).filter((rs) => rs.every((r) => r.correct)).length / Object.keys(byQ).length : null;
  lines.push(
    `| ${model} | ${condition} | ${pct(rate(g))} | ${pct(allOk)} | $${mean(g.map((r) => r.costUsd)).toFixed(3)} | ${mean(g.map((r) => r.durationMs / 1000)).toFixed(0)}s | ${mean(g.map((r) => r.turns)).toFixed(1)} | $${total(g.map((r) => r.costUsd)).toFixed(2)} |`,
  );
}

// ---- 등급별 ----
lines.push('', '## 등급별 정답률', '', `| 모델 | 조건 | ${TIERS.join(' | ')} |`, `|---|---|${TIERS.map(() => '---:').join('|')}|`);
for (const { model, condition, g } of groups)
  lines.push(`| ${model} | ${condition} | ${TIERS.map((t) => pct(rate(g.filter((r) => r.tier === t)))).join(' | ')} |`);

// ---- 질문별 ----
const cols = groups.map(({ model, condition }) => `${model[0].toUpperCase()} ${condition}`);
lines.push('', '## 질문별 (맞힌 횟수)', '', `| 질문 | 등급 | ${cols.join(' | ')} |`, `|---|---|${cols.map(() => '---:').join('|')}|`);
for (const q of QUESTIONS) {
  if (!rows.some((r) => r.qid === q.id)) continue;
  const cells = groups.map(({ g }) => {
    const rs = g.filter((r) => r.qid === q.id);
    return rs.length ? `${rs.filter((r) => r.correct).length}/${rs.length}` : '-';
  });
  lines.push(`| ${q.id} | ${q.tier} | ${cells.join(' | ')} |`);
}

lines.push('', `- 총비용: $${total(rows.map((r) => r.costUsd)).toFixed(2)}`, `- 답을 못 낸 실행: ${rows.filter((r) => !r.answered).length}회`);

const md = lines.join('\n') + '\n';
await fs.writeFile(path.join(runDir, 'report.md'), md);
console.log(md);
