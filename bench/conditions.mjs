// 실험 조건 — 조건마다 작업 폴더에 넣을 지식 문서만 다르다. task/TASK.md와 hr.db는 모든 조건에 들어간다.

export const CONDITIONS = {
  'schema-only': ['schema.md'],
  glossary: ['schema.md', 'glossary.md'],
  ontology: ['schema.md', 'ontology.md'],
  spec: ['schema.md', 'spec.md'],
};

// 별칭(haiku, sonnet)은 최신 모델이 아닌 버전으로 연결될 수 있어 ID를 직접 쓴다.
export const MODELS = {
  haiku: 'claude-haiku-5-5',
  sonnet: 'claude-sonnet-5-5',
};

// 코딩 실험(ontology-coding-bench 2차)에서 low가 정확도 손실 없이 가장 쌌다.
export const DEFAULT_EFFORT = 'low';

// 작업 폴더의 CLAUDE.md. 조건마다 넣은 문서 목록만 다르다.
export function claudeMd(files) {
  const lines = ['# 작업 안내', '', '- 과제: `TASK.md`', '- DB: `hr.db`', '- 참고 문서:'];
  for (const f of files) lines.push(`  - \`${f}\``);
  return lines.join('\n') + '\n';
}

// 하네스 다이어트(--lean): Claude Code 기본 지시문 대신 쓰는 짧은 시스템 프롬프트.
// 기본 지시문은 턴마다 약 3.5만 토큰이라 질문당 비용 대부분을 차지했다 (1차 실행).
export const LEAN_SYSTEM_PROMPT = [
  '너는 온톨컴퍼니 인사팀의 데이터 조회 담당이다.',
  '작업 폴더의 TASK.md와 참고 문서를 읽고, sqlite3로 hr.db를 조회해 질문에 답한다.',
  '도구는 꼭 필요한 만큼만 쓰고, 답은 answer.json에 저장한 뒤 끝낸다.',
].join('\n');
export const LEAN_TOOLS = ['Read', 'Write', 'Bash'];

export const prompt = (question) => `질문: ${question}\n\nTASK.md에 적힌 방법대로 조회하고 answer.json에 답을 저장하라.`;
