// 정답 계산 — hidden/questions.mjs 의 정답 SQL을 hr.db에 실행한다.
//
// 사용법: node hidden/answers.mjs [db 경로]   → 정답 표 출력

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { QUESTIONS } from './questions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function goldAnswers(dbPath = path.join(ROOT, 'data/hr.db')) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const out = {};
  for (const q of QUESTIONS) {
    const rows = db.prepare(q.sql).all().map((r) => Object.values(r));
    out[q.id] = q.shape === 'number' ? rows[0][0] : rows;
    if (out[q.id] == null || (Array.isArray(out[q.id]) && !out[q.id].length)) throw new Error(`${q.id}: 정답이 비어 있음`);
  }
  db.close();
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gold = goldAnswers(process.argv[2]);
  for (const q of QUESTIONS) console.log(`${q.id} ${q.tier.padEnd(6)} ${JSON.stringify(gold[q.id])}`);
}
