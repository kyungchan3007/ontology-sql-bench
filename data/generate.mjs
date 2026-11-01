// 인사 DB 생성기 — knowledge/source.md 규정을 따르는 가상 데이터를 시드 고정으로 만든다.
//
// 사용법: node data/generate.mjs        → data/hr.db
//
// 같은 시드면 언제 돌려도 같은 DB가 나온다 (자체 난수 생성기 사용).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { getGrants, requestLeave } from './leave-rules.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(DIR, 'hr.db');
const SEED = 20251231;
const START = '2023-01-01';
const END = '2025-12-31';
const N_EMPLOYEES = 300;

// ---- 난수 (mulberry32) ----
let s = SEED >>> 0;
const rand = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (xs) => xs[Math.floor(rand() * xs.length)];
const chance = (p) => rand() < p;
const weighted = (pairs) => {
  let r = rand() * pairs.reduce((a, [, w]) => a + w, 0);
  for (const [v, w] of pairs) if ((r -= w) < 0) return v;
  return pairs.at(-1)[0];
};

// ---- 날짜 ----
const parse = (d) => new Date(`${d}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => {
  const t = parse(d);
  t.setUTCDate(t.getUTCDate() + n);
  return fmt(t);
};
const isWeekday = (d) => {
  const w = parse(d).getUTCDay();
  return w >= 1 && w <= 5;
};
const dateBetween = (a, b) => addDays(a, int(0, Math.round((parse(b) - parse(a)) / 864e5)));
const minDate = (a, b) => (a < b ? a : b);
const maxDate = (a, b) => (a > b ? a : b);
// 일자는 1~28일만 쓴다 (29~31일 입사는 규정 미정)
const dayDate = (y, m, d = int(1, 28)) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ---- 부서 (O1, O6) ----
const ORG = [
  ['경영지원본부', [['재무실', ['회계팀', '자금팀']], ['인사실', ['인사팀', '총무팀']]]],
  ['영업본부', [['국내영업실', ['영업1팀', '영업2팀']], ['해외영업실', ['아시아팀', '유럽팀']]]],
  ['연구개발본부', [['플랫폼실', ['백엔드팀', '인프라팀']], ['제품실', ['프론트팀', '디자인팀']]]],
];
const CLOSED = { name: '영업2팀', date: '2024-07-01', moveTo: '영업1팀' };

const codePool = Array.from({ length: 21 }, (_, i) => `D${String(i + 1).padStart(2, '0')}`);
for (let i = codePool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [codePool[i], codePool[j]] = [codePool[j], codePool[i]];
}
const departments = [];
const deptByName = {};
const addDept = (name, level, parent) => {
  const d = { dept_cd: codePool.shift(), name, level, parent_cd: parent?.dept_cd ?? null, active: 1, closed_date: null };
  departments.push(d);
  deptByName[name] = d;
  return d;
};
for (const [hq, offices] of ORG) {
  const h = addDept(hq, 1, null);
  for (const [office, teams] of offices) {
    const o = addDept(office, 2, h);
    for (const t of teams) addDept(t, 3, o);
  }
}
deptByName[CLOSED.name].active = 0;
deptByName[CLOSED.name].closed_date = CLOSED.date;
const teams = departments.filter((d) => d.level === 3);
const hqOf = (d) => (d.level === 1 ? d : hqOf(departments.find((p) => p.dept_cd === d.parent_cd)));

// ---- 직원 ----
const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
const GIVEN = ['민준', '서연', '도윤', '지우', '하준', '서윤', '시우', '하은', '주원', '지민', '예준', '수아', '건우', '지아', '현우', '채원', '우진', '다은', '선우', '유진', '연우', '소율', '정우', '예린'];

const serviceYearsAt = (hire, date) => {
  const [hy, hm, hd] = hire.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  return y - hy - (m < hm || (m === hm && d < hd) ? 1 : 0);
};
const gradeFor = (years) => {
  const shifted = years + int(-1, 1);
  if (shifted < 2) return 'G1';
  if (shifted < 4) return 'G2';
  if (shifted < 7) return 'G3';
  if (shifted < 11) return 'G4';
  if (shifted < 15) return 'G5';
  return 'G6';
};
const BASE_SALARY_K = { G1: 3600, G2: 4200, G3: 4900, G4: 5800, G5: 6900, G6: 8200, E: 13000 };

const people = [];
for (let i = 0; i < N_EMPLOYEES; i++) {
  const exec = i < 6;
  const hireYear = exec ? int(2008, 2014) : weighted([[int(2008, 2014), 2], [int(2015, 2020), 3], [int(2021, 2022), 2], [int(2023, 2025), 3]]);
  let hire = dayDate(hireYear, int(1, 12));
  // 수습 경계(P5) 확인용: 기준 시점에 막 수습이 끝난 사람(09-30)과 아직 수습인 사람(10-01)
  if (i === 6) hire = '2025-09-30';
  if (i === 7) hire = '2025-10-01';
  const p = { hire, exec, name: pick(SURNAMES) + pick(GIVEN) };
  // 퇴사자 약 10% (2023 ~ 2025, 입사 3개월 뒤부터)
  if (!exec && chance(0.1)) {
    const from = maxDate(START, addDays(hire, 90));
    if (from < '2025-12-01') p.end = dateBetween(from, '2025-12-01');
  }
  p.grade = exec ? 'E' : gradeFor(serviceYearsAt(hire, END));
  people.push(p);
}
people.sort((a, b) => a.hire.localeCompare(b.hire) || a.name.localeCompare(b.name));
people.forEach((p, i) => (p.emp_no = `OT${String(i + 1).padStart(4, '0')}`));
const lastDay = (p) => minDate(p.end ?? END, END);

// ---- 소속 이력 (O2, O3, O6) ----
const empDepts = [];
let execIdx = 0;
for (const p of people) {
  if (p.exec) {
    const hq = departments.filter((d) => d.level === 1)[execIdx++ % 3];
    empDepts.push({ emp_no: p.emp_no, dept_cd: hq.dept_cd, is_primary: 1, from_date: p.hire, to_date: p.end ?? null });
    p.dept_old = hq.dept_cd;
    continue;
  }
  // 부장 절반은 실 소속
  const office = p.grade === 'G6' && chance(0.5);
  const pool = office ? departments.filter((d) => d.level === 2) : teams.filter((t) => t.active || p.hire < CLOSED.date);
  let cur = pick(pool);
  p.dept_old = chance(0.7) ? cur.dept_cd : pick(teams).dept_cd;
  let from = p.hire;
  const stints = [];
  // 15%는 기록 기간 중 한 번 부서 이동
  if (chance(0.15)) {
    const moveFrom = addDays(maxDate(START, p.hire), 30);
    if (moveFrom < lastDay(p)) {
      const moveDate = dateBetween(moveFrom, lastDay(p));
      const next = pick(pool.filter((d) => d !== cur && (d.active || moveDate < CLOSED.date)));
      stints.push([cur, from, addDays(moveDate, -1)]);
      cur = next;
      from = moveDate;
    }
  }
  stints.push([cur, from, p.end ?? null]);
  // 폐지 부서 소속이면 폐지일에 이관
  for (const [dept, f, t] of stints) {
    if (dept.name === CLOSED.name && (t === null || t >= CLOSED.date) && f < CLOSED.date) {
      empDepts.push({ emp_no: p.emp_no, dept_cd: dept.dept_cd, is_primary: 1, from_date: f, to_date: addDays(CLOSED.date, -1) });
      empDepts.push({ emp_no: p.emp_no, dept_cd: deptByName[CLOSED.moveTo].dept_cd, is_primary: 1, from_date: CLOSED.date, to_date: t });
    } else {
      empDepts.push({ emp_no: p.emp_no, dept_cd: dept.dept_cd, is_primary: 1, from_date: f, to_date: t });
    }
  }
  // 8%는 겸직
  if (chance(0.08)) {
    const primaryNow = empDepts.findLast((e) => e.emp_no === p.emp_no).dept_cd;
    const extra = pick(teams.filter((t) => t.active && t.dept_cd !== primaryNow));
    const f = maxDate(dateBetween(START, '2025-06-30'), maxDate(p.hire, CLOSED.date));
    if (f <= lastDay(p)) empDepts.push({ emp_no: p.emp_no, dept_cd: extra.dept_cd, is_primary: 0, from_date: f, to_date: p.end ?? null });
  }
}

// ---- 연봉 이력 (P1, P2) ----
const salaries = [];
const round10 = (x) => Math.round(x / 10) * 10;
for (const p of people) {
  let amount = round10(BASE_SALARY_K[p.grade] * (0.88 + rand() * 0.2));
  const rows = [];
  // 2023 이전 입사자는 입사일 연봉 + 매년 1월 1일 인상
  const years = [2023, 2024, 2025].filter((y) => `${y}-01-01` > p.hire && `${y}-01-01` <= lastDay(p));
  let a = round10(amount / (1.04 ** years.length));
  rows.push([p.hire, a]);
  for (const y of years) {
    a = round10(a * (1.02 + rand() * 0.05));
    rows.push([`${y}-01-01`, a]);
  }
  // 20%는 기록 기간 중 4월 1일 승진 인상
  if (!p.exec && chance(0.2)) {
    const y = pick([2023, 2024, 2025]);
    const d = `${y}-04-01`;
    if (d > p.hire && d <= lastDay(p)) {
      const before = rows.filter((r) => r[0] <= d).at(-1)[1];
      const bump = round10(before * 1.08);
      // 그 뒤 인상분도 같이 올린다
      for (const r of rows) if (r[0] > d) r[1] = round10(r[1] * 1.08);
      rows.push([d, bump]);
    }
  }
  rows.sort((x, y) => x[0].localeCompare(y[0]));
  for (const [effective_from, amount_k] of rows) salaries.push({ emp_no: p.emp_no, effective_from, amount_k });
  p.salaryRows = rows;
}

// ---- 평가 (P3) ----
const evaluations = [];
for (const p of people)
  for (const y of [2023, 2024, 2025]) {
    if (p.hire > `${y}-09-30` || (p.end && p.end < `${y}-12-31`)) continue;
    evaluations.push({ emp_no: p.emp_no, year: y, rating: weighted([['S', 5], ['A', 20], ['B', 50], ['C', 20], ['D', 5]]) });
  }

// ---- 결근 · 휴직 (R4, R5) ----
const absences = [];
const busy = new Map(); // emp_no → [[from, to]]
const free = (p, f, t) => (busy.get(p.emp_no) ?? []).every(([a, b]) => t < a || f > b);
const addAbsence = (p, from, to, reason_cd) => {
  const hi = p.end ?? (reason_cd === '30' || reason_cd === '40' ? '2026-06-30' : END);
  if (from < maxDate(START, p.hire) || from > minDate(hi, END)) return false;
  to = minDate(to, hi);
  if (!free(p, from, to)) return false;
  busy.set(p.emp_no, [...(busy.get(p.emp_no) ?? []), [from, to]]);
  absences.push({ emp_no: p.emp_no, from_date: from, to_date: to, reason_cd });
  return true;
};
const workStart = (p) => maxDate(START, p.hire);
const regulars = people.filter((p) => !p.exec);

// 육아휴직 12명 (그중 일부는 기준 시점에도 휴직 중), 산재 휴업 3명, 장기 병가 4명(출근율 80% 미만 유도)
for (let n = 0, guard = 0; n < 12 && guard < 500; guard++) {
  const p = pick(regulars);
  const f = dateBetween(addDays(workStart(p), 30), '2025-11-30');
  if (addAbsence(p, f, addDays(f, int(90, 365)), '30')) n++;
}
for (let n = 0, guard = 0; n < 3 && guard < 500; guard++) {
  const p = pick(regulars);
  const f = dateBetween(addDays(workStart(p), 30), '2025-10-31');
  if (addAbsence(p, f, addDays(f, int(30, 75)), '40')) n++;
}
for (let n = 0, guard = 0; n < 4 && guard < 500; guard++) {
  const p = pick(regulars.filter((q) => q.hire < '2022-01-01'));
  const y = pick([2023, 2024]);
  const f = dayDate(y, int(2, 8));
  if (addAbsence(p, f, addDays(f, int(70, 100)), '20')) n++;
}
// 짧은 결근 · 예비군
for (const p of people)
  for (const y of [2023, 2024, 2025]) {
    const lo = maxDate(`${y}-01-01`, workStart(p));
    const hi = minDate(`${y}-12-31`, lastDay(p));
    if (lo > hi) continue;
    for (let k = int(0, 2); k > 0; k--) {
      const f = dateBetween(lo, hi);
      addAbsence(p, f, addDays(f, int(0, 1)), '10');
    }
    if (chance(0.2)) {
      const f = dateBetween(lo, hi);
      addAbsence(p, f, addDays(f, int(0, 4)), '20');
    }
    if (!p.exec && ['G1', 'G2', 'G3'].includes(p.grade) && chance(0.25)) {
      const f = dateBetween(lo, hi);
      addAbsence(p, f, addDays(f, int(0, 2)), '50');
    }
  }
absences.sort((a, b) => a.emp_no.localeCompare(b.emp_no) || a.from_date.localeCompare(b.from_date));

// ---- 상태 (O4) ----
for (const p of people) {
  // 휴직 = 기준 시점에 육아휴직 · 산재 휴업 중
  const onLeave = absences.some((a) => a.emp_no === p.emp_no && ['30', '40'].includes(a.reason_cd) && a.from_date <= END && a.to_date >= END);
  p.status = p.end ? 'T' : onLeave ? 'L' : 'A';
}

// ---- 연차 발생 · 사용 (R1 ~ R8) ----
const leaveGrants = [];
const leaveUsages = [];
for (const p of people) {
  const emp = {
    hireDate: p.hire,
    absences: absences.filter((a) => a.emp_no === p.emp_no).map((a) => ({ from: a.from_date, to: a.to_date, reason: a.reason_cd })),
  };
  for (const g of getGrants(emp, lastDay(p))) if (g.date >= START) leaveGrants.push({ emp_no: p.emp_no, grant_date: g.date, days: g.days });

  const absent = (d) => emp.absences.some((a) => d >= a.from && d <= a.to);
  const usages = [];
  for (let d = workStart(p); d <= lastDay(p); d = addDays(d, 1)) {
    if (!isWeekday(d) || absent(d) || !chance(0.055)) continue;
    const unit = weighted([['D', 6], ['H', 3], ['Q', 1]]);
    if (requestLeave(emp, usages, { date: d, unit }).approved) usages.push({ date: d, unit });
  }
  for (const u of usages) leaveUsages.push({ emp_no: p.emp_no, use_date: u.date, unit_cd: u.unit });
}

// ---- 근무일 달력 ----
const workdays = [];
for (let d = START; d <= END; d = addDays(d, 1)) workdays.push({ date: d, is_workday: isWeekday(d) ? 1 : 0 });

// ---- 저장 ----
fs.rmSync(DB_PATH, { force: true });
const db = new DatabaseSync(DB_PATH);
db.exec(fs.readFileSync(path.join(DIR, 'schema.sql'), 'utf8'));
const insert = (table, rows) => {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const stmt = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  db.exec('BEGIN');
  for (const r of rows) stmt.run(...cols.map((c) => r[c]));
  db.exec('COMMIT');
};
insert('departments', departments);
insert(
  'employees',
  people.map((p) => ({ emp_no: p.emp_no, name: p.name, hire_date: p.hire, end_date: p.end ?? null, status: p.status, grade_cd: p.grade, dept_old: p.dept_old })),
);
insert('emp_depts', empDepts);
insert('salaries', salaries);
insert('evaluations', evaluations);
insert('absences', absences);
insert('leave_grants', leaveGrants);
insert('leave_usages', leaveUsages);
insert('workdays', workdays);
db.close();

const count = (t) => ({ departments, employees: people, emp_depts: empDepts, salaries, evaluations, absences, leave_grants: leaveGrants, leave_usages: leaveUsages, workdays })[t].length;
console.log(`hr.db 생성 (seed ${SEED})`);
for (const t of ['departments', 'employees', 'emp_depts', 'salaries', 'evaluations', 'absences', 'leave_grants', 'leave_usages', 'workdays'])
  console.log(`  ${t.padEnd(13)} ${count(t)}`);
