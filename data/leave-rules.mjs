// 연차 규칙(R1~R9) 구현 — ontology-coding-bench@b5db954 hidden/reference/leave.js 복사본을 DB 코드값에 맞춘 것. 데이터 생성에만 쓴다.
// 원본 규칙이 바뀌면 이 파일과 knowledge/source.md 4~5절을 함께 맞춘다.

const DEEMED_PRESENT = new Set(['30', '40', '50']); // R5
const UNIT_DAYS = { D: 1, H: 0.5, Q: 0.25 }; // R6

// ---- 날짜 유틸 (UTC, 'YYYY-MM-DD') ----
const parse = (s) => new Date(`${s}T00:00:00Z`);
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
const isWeekday = (s) => {
  const w = parse(s).getUTCDay();
  return w >= 1 && w <= 5;
};
// 같은 일자로 n개월 뒤. 그 달에 해당 일자가 없으면 말일.
function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return fmt(t);
}
const firstOfNextMonth = (s) => {
  const [y, m] = s.split('-').map(Number);
  return fmt(new Date(Date.UTC(y, m, 1)));
};

// 결근일 집합: 소정근로일(월~금) 중 출근 간주가 아닌 날
function absentDays(employee) {
  const days = new Set();
  for (const a of employee.absences ?? []) {
    if (DEEMED_PRESENT.has(a.reason)) continue;
    for (let s = a.from; s <= a.to; s = addDays(s, 1)) if (isWeekday(s)) days.add(s);
  }
  return days;
}
const hasAbsenceIn = (absent, from, toExclusive) => {
  for (const s of absent) if (s >= from && s < toExclusive) return true;
  return false;
};

// 근속연수: 입사일부터 date까지 만으로 채운 햇수
function serviceYears(hireDate, date) {
  const [hy, hm, hd] = hireDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  let n = y - hy;
  if (m < hm || (m === hm && d < hd)) n -= 1;
  return n;
}

export function getGrants(employee, asOf) {
  const { hireDate } = employee;
  const absent = absentDays(employee);
  const grants = [];

  // R1. 1년 미만 월 단위 발생 (최대 11일)
  for (let k = 1; k <= 11; k++) {
    const start = addMonths(hireDate, k - 1);
    const date = addMonths(hireDate, k);
    if (date > asOf) break;
    if (!hasAbsenceIn(absent, start, date)) grants.push({ date, days: 1 });
  }

  // R2. 1주년이 되는 달의 다음 달 1일에 14일
  const firstAnnual = firstOfNextMonth(addMonths(hireDate, 12));
  if (firstAnnual <= asOf) grants.push({ date: firstAnnual, days: 14 });

  // R2-1. 이후 매년 1월 1일 (R2 발생일보다 뒤인 기준일만)
  const firstYear = Number(firstAnnual.slice(0, 4)) + 1;
  for (let y = firstYear; `${y}-01-01` <= asOf; y++) {
    const date = `${y}-01-01`;
    const n = serviceYears(hireDate, date);
    let days = Math.min(14 + (n - 1), 25); // R3

    // R4. 직전 회계연도 출근율 80% 미만
    const prev = y - 1;
    let workdays = 0;
    let absentCount = 0;
    for (let s = `${prev}-01-01`; s <= `${prev}-12-31`; s = addDays(s, 1)) {
      if (!isWeekday(s)) continue;
      workdays++;
      if (absent.has(s)) absentCount++;
    }
    if ((workdays - absentCount) / workdays < 0.8) {
      days = 0;
      for (let m = 1; m <= 12; m++) {
        const from = `${prev}-${String(m).padStart(2, '0')}-01`;
        if (!hasAbsenceIn(absent, from, firstOfNextMonth(from))) days++;
      }
    }
    if (days > 0) grants.push({ date, days });
  }

  return grants.sort((a, b) => a.date.localeCompare(b.date));
}

// R8. 잔여는 회계연도 단위로 계산한다 (연말에 수당으로 정산되고 이월되지 않음)
export function getBalance(employee, usages, asOf) {
  const year = asOf.slice(0, 4);
  const granted = getGrants(employee, asOf)
    .filter((g) => g.date.startsWith(year))
    .reduce((sum, g) => sum + g.days, 0);
  const used = (usages ?? [])
    .filter((u) => u.date.startsWith(year) && u.date <= asOf)
    .reduce((sum, u) => sum + UNIT_DAYS[u.unit], 0);
  return granted - used;
}

export function requestLeave(employee, usages, request) {
  const days = UNIT_DAYS[request.unit];
  if (days === undefined) return { approved: false }; // R6 허용 단위
  return { approved: days <= getBalance(employee, usages, request.date) };
}

// R9. 수당 계산
export function yearEndPayout(employee, usages, year) {
  const remainingDays = getBalance(employee, usages, `${year}-12-31`);
  const paidDays = Math.floor(remainingDays * 2) / 2;
  const dailyWage = Math.floor((employee.annualSalary * 8) / (12 * 209));
  const amount = Math.floor(dailyWage * paidDays);
  return { remainingDays, paidDays, dailyWage, amount };
}
