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

export const prompt = (question) => `질문: ${question}\n\nTASK.md에 적힌 방법대로 조회하고 answer.json에 답을 저장하라.`;
