// 질문 30개와 정답 SQL — 실험 중 AI에게 보여 주지 않는다.
//
// tier
//   simple: 테이블 하나, 규칙이 거의 없음
//   join:   테이블 여러 개
//   rule:   회사 규칙(O · P · R)을 알아야 함
//   trap:   코드 · 단위 · 옛 컬럼 · 폐지 부서 등 문서에만 답이 있음
// shape
//   number: 숫자 하나
//   rows:   [[값, 값, ...], ...] — 순서는 질문에 적힌 대로
// rules: 이 질문에 필요한 규정 번호 (source.md)

// 시점 연봉(P2, 천 원). at: SQL 식 (예: "'2025-12-31'", 'e.end_date')
const SAL_AT = (at) =>
  `(SELECT amount_k FROM salaries s WHERE s.emp_no = e.emp_no AND s.effective_from <= ${at} ORDER BY s.effective_from DESC LIMIT 1)`;

export const QUESTIONS = [
  // ---- simple ----
  {
    id: 'Q01', tier: 'simple', shape: 'number', rules: ['O6'],
    question: '현재 운영 중인(폐지되지 않은) 부서는 몇 개인가?',
    sql: `SELECT COUNT(*) FROM departments WHERE active = 1`,
  },
  {
    id: 'Q02', tier: 'simple', shape: 'number', rules: [],
    question: '2025년 평가에서 S 등급을 받은 기록은 몇 건인가?',
    sql: `SELECT COUNT(*) FROM evaluations WHERE year = 2025 AND rating = 'S'`,
  },
  {
    id: 'Q03', tier: 'simple', shape: 'number', rules: [],
    question: '2023년에 입사한 사람(임원 포함)은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM employees WHERE hire_date BETWEEN '2023-01-01' AND '2023-12-31'`,
  },
  {
    id: 'Q04', tier: 'simple', shape: 'number', rules: ['R6'],
    question: '2024년에 반반차는 몇 번 사용되었나?',
    sql: `SELECT COUNT(*) FROM leave_usages WHERE unit_cd = 'Q' AND use_date BETWEEN '2024-01-01' AND '2024-12-31'`,
  },
  {
    id: 'Q05', tier: 'simple', shape: 'number', rules: ['O4'],
    question: '지금 휴직 중인 직원은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM employees WHERE status = 'L'`,
  },
  {
    id: 'Q06', tier: 'simple', shape: 'number', rules: [],
    question: '2024년의 소정근로일은 며칠인가?',
    sql: `SELECT COUNT(*) FROM workdays WHERE is_workday = 1 AND date BETWEEN '2024-01-01' AND '2024-12-31'`,
  },
  {
    id: 'Q07', tier: 'simple', shape: 'number', rules: ['O4'],
    question: '2025년에 퇴사한 사람은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM employees WHERE end_date BETWEEN '2025-01-01' AND '2025-12-31'`,
  },
  {
    id: 'Q08', tier: 'simple', shape: 'number', rules: ['R5'],
    question: '시작일이 2025년인 예비군 훈련 기록은 몇 건인가?',
    sql: `SELECT COUNT(*) FROM absences WHERE reason_cd = '50' AND from_date BETWEEN '2025-01-01' AND '2025-12-31'`,
  },

  // ---- join ----
  {
    id: 'Q09', tier: 'join', shape: 'number', rules: ['O3'],
    question: '현재 인프라팀에 주소속을 둔 직원은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM emp_depts ed JOIN departments d USING (dept_cd)
          WHERE d.name = '인프라팀' AND ed.is_primary = 1 AND ed.from_date <= '2025-12-31' AND ed.to_date IS NULL`,
  },
  {
    id: 'Q10', tier: 'join', shape: 'rows', rules: ['O3'],
    question: '현재 팀별 주소속 인원을 [[팀 이름, 인원], ...] 으로 답하라. 인원이 많은 순, 같으면 팀 이름 가나다순. 운영 중인 팀만.',
    sql: `SELECT d.name, COUNT(ed.emp_no) AS n FROM departments d
          LEFT JOIN emp_depts ed ON ed.dept_cd = d.dept_cd AND ed.is_primary = 1 AND ed.to_date IS NULL
          WHERE d.level = 3 AND d.active = 1 GROUP BY d.dept_cd ORDER BY n DESC, d.name`,
  },
  {
    id: 'Q11', tier: 'join', shape: 'number', rules: ['P1', 'P2', 'P5'],
    question: '기준 시점의 과장 평균 연봉은 얼마인가? 원 단위, 원 미만 버림.',
    sql: `SELECT CAST(AVG(${SAL_AT("'2025-12-31'")} * 1000) AS INTEGER) FROM employees e
          WHERE e.grade_cd = 'G4' AND e.hire_date <= '2025-12-31' AND (e.end_date IS NULL OR e.end_date >= '2025-12-31')
            AND date(e.hire_date, '+3 months') <= '2025-12-31'`,
  },
  {
    id: 'Q12', tier: 'join', shape: 'number', rules: ['O3', 'O4'],
    question: '현재 겸직 중인 재직자는 몇 명인가?',
    sql: `SELECT COUNT(DISTINCT ed.emp_no) FROM emp_depts ed JOIN employees e USING (emp_no)
          WHERE ed.is_primary = 0 AND ed.from_date <= '2025-12-31' AND ed.to_date IS NULL AND e.end_date IS NULL`,
  },
  {
    id: 'Q13', tier: 'join', shape: 'number', rules: ['R2-1'],
    question: '2024년 1월 1일에 발생한 연차는 모두 며칠인가?',
    sql: `SELECT SUM(days) FROM leave_grants WHERE grant_date = '2024-01-01'`,
  },
  {
    id: 'Q14', tier: 'join', shape: 'number', rules: ['O4', 'R6'],
    question: '현재 재직자 중 2025년에 쓴 연차가 모두 합쳐 5일 미만인 사람은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM employees e WHERE e.end_date IS NULL
          AND COALESCE((SELECT SUM(CASE unit_cd WHEN 'D' THEN 1 WHEN 'H' THEN 0.5 ELSE 0.25 END) FROM leave_usages u
                        WHERE u.emp_no = e.emp_no AND u.use_date BETWEEN '2025-01-01' AND '2025-12-31'), 0) < 5`,
  },
  {
    id: 'Q15', tier: 'join', shape: 'rows', rules: [],
    question: '2023년 평가 등급별 기록 수를 [[등급, 건수], ...] 로 답하라. 등급은 S, A, B, C, D 순.',
    sql: `SELECT rating, COUNT(*) FROM evaluations WHERE year = 2023 GROUP BY rating
          ORDER BY CASE rating WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 ELSE 5 END`,
  },
  {
    id: 'Q16', tier: 'join', shape: 'number', rules: ['P1', 'P2'],
    question: '퇴사자들의 퇴사일 시점 연봉 중 가장 높은 값은 얼마인가? 원 단위.',
    sql: `SELECT MAX(${SAL_AT('e.end_date')} * 1000) FROM employees e WHERE e.end_date IS NOT NULL`,
  },

  // ---- rule ----
  {
    id: 'Q17', tier: 'rule', shape: 'number', rules: ['O4', 'O5'],
    question: '현재 직원은 몇 명인가? 회사 집계 기준으로.',
    sql: `SELECT COUNT(*) FROM employees WHERE end_date IS NULL AND grade_cd <> 'E'`,
  },
  {
    id: 'Q18', tier: 'rule', shape: 'number', rules: ['O4', 'O5', 'P1', 'P2', 'P5'],
    question: '기준 시점의 직원 평균 연봉은 얼마인가? 회사 집계 기준, 원 단위, 원 미만 버림.',
    sql: `SELECT CAST(AVG(${SAL_AT("'2025-12-31'")} * 1000) AS INTEGER) FROM employees e
          WHERE e.end_date IS NULL AND e.grade_cd <> 'E' AND date(e.hire_date, '+3 months') <= '2025-12-31'`,
  },
  {
    id: 'Q19', tier: 'rule', shape: 'number', rules: ['O5', 'P1', 'P2', 'P3', 'P4'],
    question: '2025년에 지급된 성과급은 모두 얼마인가? 원 단위.',
    sql: `SELECT SUM(${SAL_AT("'2024-12-31'")} * 1000 *
                 CASE v.rating WHEN 'S' THEN 20 WHEN 'A' THEN 10 WHEN 'B' THEN 5 ELSE 0 END / 100)
          FROM evaluations v JOIN employees e USING (emp_no)
          WHERE v.year = 2024 AND e.grade_cd <> 'E' AND (e.end_date IS NULL OR e.end_date >= '2025-03-31')`,
  },
  {
    id: 'Q20', tier: 'rule', shape: 'number', rules: ['R4', 'R5'],
    question: '2024년 1월 1일 전에 입사해 2024년 12월 31일까지 재직한 사람 중, 2024년 출근율이 80% 미만인 사람은 몇 명인가?',
    sql: `WITH absent AS (
            SELECT a.emp_no, COUNT(DISTINCT w.date) AS n FROM absences a
            JOIN workdays w ON w.date BETWEEN a.from_date AND a.to_date AND w.is_workday = 1 AND w.date BETWEEN '2024-01-01' AND '2024-12-31'
            WHERE a.reason_cd IN ('10', '20') GROUP BY a.emp_no),
          total AS (SELECT COUNT(*) AS n FROM workdays WHERE is_workday = 1 AND date BETWEEN '2024-01-01' AND '2024-12-31')
          SELECT COUNT(*) FROM employees e JOIN absent USING (emp_no), total
          WHERE e.hire_date < '2024-01-01' AND (e.end_date IS NULL OR e.end_date >= '2024-12-31')
            AND (total.n - absent.n) * 1.0 / total.n < 0.8`,
  },
  {
    id: 'Q21', tier: 'rule', shape: 'number', rules: ['P6', 'R6', 'R8', 'R9'],
    question: '2025년 말 미사용 연차 수당은 모두 얼마인가? 원 단위.',
    sql: `WITH bal AS (
            SELECT e.emp_no, ${SAL_AT("'2025-12-31'")} AS sal_k,
              COALESCE((SELECT SUM(days) FROM leave_grants g WHERE g.emp_no = e.emp_no AND g.grant_date BETWEEN '2025-01-01' AND '2025-12-31'), 0)
              - COALESCE((SELECT SUM(CASE unit_cd WHEN 'D' THEN 1 WHEN 'H' THEN 0.5 ELSE 0.25 END) FROM leave_usages u
                          WHERE u.emp_no = e.emp_no AND u.use_date BETWEEN '2025-01-01' AND '2025-12-31'), 0) AS remain
            FROM employees e WHERE e.end_date IS NULL)
          SELECT SUM(CAST((sal_k * 1000 * 8 / 2508) * (CAST(remain * 2 AS INTEGER) / 2.0) AS INTEGER)) FROM bal`,
  },
  {
    id: 'Q22', tier: 'rule', shape: 'number', rules: ['O1', 'O2', 'O3', 'O5'],
    question: '현재 영업본부 인원은 몇 명인가? 회사 집계 기준으로.',
    sql: `WITH RECURSIVE sub(dept_cd) AS (
            SELECT dept_cd FROM departments WHERE name = '영업본부'
            UNION ALL SELECT d.dept_cd FROM departments d JOIN sub ON d.parent_cd = sub.dept_cd)
          SELECT COUNT(*) FROM emp_depts ed JOIN employees e USING (emp_no)
          WHERE ed.dept_cd IN (SELECT dept_cd FROM sub) AND ed.is_primary = 1 AND ed.to_date IS NULL AND e.grade_cd <> 'E'`,
  },
  {
    id: 'Q23', tier: 'rule', shape: 'number', rules: ['O4', 'O5', 'P5'],
    question: '2025년 6월 30일 기준 수습 중인 직원은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM employees e
          WHERE e.grade_cd <> 'E' AND e.hire_date <= '2025-06-30' AND (e.end_date IS NULL OR e.end_date >= '2025-06-30')
            AND '2025-06-30' < date(e.hire_date, '+3 months')`,
  },
  {
    id: 'Q24', tier: 'rule', shape: 'number', rules: ['O5', 'P1', 'P2', 'P6'],
    question: '임원을 뺀 사람 중 2023년 연도 연봉 기준 1일 통상임금이 가장 높은 값은 얼마인가? 원 단위.',
    sql: `SELECT MAX(${SAL_AT("MIN(COALESCE(e.end_date, '2023-12-31'), '2023-12-31')")} * 1000 * 8 / 2508)
          FROM employees e WHERE e.grade_cd <> 'E' AND e.hire_date <= '2023-12-31' AND (e.end_date IS NULL OR e.end_date >= '2023-01-01')`,
  },

  // ---- trap ----
  {
    id: 'Q25', tier: 'trap', shape: 'number', rules: ['O3'],
    question: '현재 디자인팀 인원은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM emp_depts ed JOIN departments d USING (dept_cd)
          WHERE d.name = '디자인팀' AND ed.is_primary = 1 AND ed.to_date IS NULL`,
  },
  {
    id: 'Q26', tier: 'trap', shape: 'number', rules: ['R6'],
    question: '2024년에 사용된 연차는 모두 며칠인가?',
    sql: `SELECT SUM(CASE unit_cd WHEN 'D' THEN 1 WHEN 'H' THEN 0.5 ELSE 0.25 END) FROM leave_usages
          WHERE use_date BETWEEN '2024-01-01' AND '2024-12-31'`,
  },
  {
    id: 'Q27', tier: 'trap', shape: 'number', rules: ['O4', 'O5', 'P1', 'P2', 'P5'],
    question: '기준 시점 직원 연봉 합계는 얼마인가? 회사 집계 기준, 원 단위.',
    sql: `SELECT SUM(${SAL_AT("'2025-12-31'")} * 1000) FROM employees e
          WHERE e.end_date IS NULL AND e.grade_cd <> 'E' AND date(e.hire_date, '+3 months') <= '2025-12-31'`,
  },
  {
    id: 'Q28', tier: 'trap', shape: 'number', rules: ['R5'],
    question: '2024년에 병가로 빠진 소정근로일은 모두 며칠인가?',
    sql: `SELECT COUNT(*) FROM absences a JOIN workdays w ON w.date BETWEEN a.from_date AND a.to_date
          WHERE a.reason_cd = '20' AND w.is_workday = 1 AND w.date BETWEEN '2024-01-01' AND '2024-12-31'`,
  },
  {
    id: 'Q29', tier: 'trap', shape: 'number', rules: ['O3', 'O6'],
    question: '2024년 6월 30일에 영업2팀에 주소속을 둔 직원은 몇 명이었나?',
    sql: `SELECT COUNT(*) FROM emp_depts ed JOIN departments d USING (dept_cd)
          WHERE d.name = '영업2팀' AND ed.is_primary = 1 AND ed.from_date <= '2024-06-30' AND (ed.to_date IS NULL OR ed.to_date >= '2024-06-30')`,
  },
  {
    id: 'Q30', tier: 'trap', shape: 'number', rules: ['O5', 'P3', 'P4'],
    question: '2023년 평가에서 A 등급을 받은 사람 중 그 평가의 성과급을 받지 못한 사람은 몇 명인가?',
    sql: `SELECT COUNT(*) FROM evaluations v JOIN employees e USING (emp_no)
          WHERE v.year = 2023 AND v.rating = 'A' AND (e.grade_cd = 'E' OR (e.end_date IS NOT NULL AND e.end_date < '2024-03-31'))`,
  },
];
