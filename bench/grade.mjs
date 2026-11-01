// 채점 — 챗봇의 answer 값을 정답 SQL 실행 결과와 비교한다.
//   number: 숫자 하나. 차이 0.01 이하면 정답
//   rows:   행 수와 순서가 같고, 칸마다 같으면 정답 (숫자는 차이 0.01 이하, 문자는 앞뒤 공백 무시)

const TOL = 0.01;

const toNumber = (v) => {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(/[,\s원일명건]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const sameCell = (a, g) => {
  if (typeof g === 'number') {
    const n = toNumber(a);
    return n !== null && Math.abs(n - g) <= TOL;
  }
  return String(a ?? '').trim() === String(g ?? '').trim();
};

export function isCorrect(shape, answer, gold) {
  if (shape === 'number') {
    const v = Array.isArray(answer) ? answer.flat(Infinity)[0] : answer;
    return sameCell(v, gold);
  }
  if (!Array.isArray(answer) || answer.length !== gold.length) return false;
  return gold.every((row, i) => Array.isArray(answer[i]) && answer[i].length === row.length && row.every((g, j) => sameCell(answer[i][j], g)));
}
