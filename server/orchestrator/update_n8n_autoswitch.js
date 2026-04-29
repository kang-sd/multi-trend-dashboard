// HealthchkAutoSwitch01 수정:
// 자동전환 브로드캐스트 코드 노드를 안전한 문자열 연결 방식으로 재구성

const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const N8N_KEY = process.env.N8N_API_KEY || '';
const WF_ID = 'HealthchkAutoSwitch01';

if (!N8N_KEY) {
  console.error('❌ N8N_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const HEADERS = {
  'X-N8N-API-KEY': N8N_KEY,
  'Content-Type': 'application/json',
};

const ENDPOINTS = [
  'https://us-central1-career-aptitude-final.cloudfunctions.net/orchestratorUpdate',
  'https://us-central1-healthy-final.cloudfunctions.net/orchestratorUpdate',
  'https://us-central1-mbti-final.cloudfunctions.net/orchestratorUpdate',
  'https://us-central1-tarot-final-1b241.cloudfunctions.net/orchestratorUpdate',
  'https://us-central1-values-test-final.cloudfunctions.net/orchestratorUpdate',
  'https://us-central1-core-competencies-finai.cloudfunctions.net/orchestratorUpdate',
  'https://us-central1-multiple-intelligence-final.cloudfunctions.net/orchestratorUpdate',
];

const buildBroadcastCode = () => [
  '// 7개 Firebase 프로젝트에 config 동시 브로드캐스트',
  "const config = $input.first().json.config;",
  "const secret = 'n8n-orch-2026';",
  '',
  `const ENDPOINTS = ${JSON.stringify(ENDPOINTS, null, 2)};`,
  '',
  'const results = await Promise.allSettled(',
  '  ENDPOINTS.map((url) =>',
  '    fetch(url, {',
  "      method: 'POST',",
  "      headers: { 'Content-Type': 'application/json' },",
  '      body: JSON.stringify({ secret, config }),',
  '      signal: AbortSignal.timeout(12000),',
  '    }).then(async (response) => {',
  '      if (!response.ok) {',
  '        throw new Error((await response.text()).slice(0, 100));',
  '      }',
  '      return { url, ok: true };',
  '    })',
  '  )',
  ');',
  '',
  "const ok = results.filter((item) => item.status === 'fulfilled').length;",
  "const fail = results.filter((item) => item.status === 'rejected').map((item) => item.reason?.message ?? String(item.reason));",
  '',
  "console.log('[AutoSwitch] 브로드캐스트: ' + ok + '/' + ENDPOINTS.length + ' 성공' + (fail.length ? ' | Errors: ' + fail.join(', ') : ''));",
  'return [{ json: { ok, total: ENDPOINTS.length, fail, config } }];',
].join('\n');

async function api(method, path, body) {
  const response = await fetch(`${N8N_BASE}/api/v1${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

(async () => {
  try {
    console.log('📥 워크플로우 로드 중...');
    const workflow = await api('GET', `/workflows/${WF_ID}`);
    const nodes = workflow.nodes.map((node) => {
      if (node.name !== 'Broadcast Config') return node;
      return {
        ...node,
        parameters: {
          ...node.parameters,
          jsCode: buildBroadcastCode(),
        },
      };
    });

    console.log('⏸️ 워크플로우 비활성화 중...');
    await api('POST', `/workflows/${WF_ID}/deactivate`);

    console.log('📤 워크플로우 업데이트 중...');
    await api('PUT', `/workflows/${WF_ID}`, {
      name: workflow.name,
      nodes,
      connections: workflow.connections,
      settings: workflow.settings || {},
    });

    console.log('▶️ 워크플로우 재활성화 중...');
    await api('POST', `/workflows/${WF_ID}/activate`);
    console.log('✅ HealthchkAutoSwitch01 복구 완료');
  } catch (error) {
    console.error('❌ 오류:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();
