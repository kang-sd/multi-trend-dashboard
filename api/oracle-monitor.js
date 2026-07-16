// Vercel 서버리스 함수 (Node 런타임): /api/oracle-monitor
// CNS 모니터 탭 데이터 제공. 브라우저(HTTPS)에서 직접 못 여는 Oracle VM(HTTP) 상태를
// 서버 측에서 조회해 JSON으로 반환한다. (혼합 콘텐츠/CORS 회피)
//
// 반환 형태 (types/dashboard.ts의 OracleMonitorData):
//   { services:{n8n,orchestrator,multiTrend}, workflows:[], models:{live,dead,checkedAt}, cnsEvents:[] }
//
// 현재 VM 실측(접근권한_가이드 기준): n8n(5678)만 운영. orchestrator(7070)/multi-trend(3000)는 미배포.
// n8n 워크플로 목록은 X-N8N-API-KEY 필요 → 키(N8N_API_KEY) 있을 때만 채운다.

import { STATIC_SNAPSHOT } from './orchestrator/_snapshot_static.js';

const VM_HOST = process.env.ORACLE_VM_HOST || '146.56.110.229';
const N8N_BASE = process.env.N8N_BASE_URL || `http://${VM_HOST}:5678`;
// orchestrator(7070)·multi-trend(3000)는 직접 포트가 닫혀 있고 nginx(80) 뒤에서 서비스된다.
// Security List가 22/80/443/5678만 개방하므로 반드시 nginx(포트 80) 경유로 핑해야 한다.
const ORCH_BASE = process.env.ORCH_BASE_URL || `http://${VM_HOST}`;
const MT_BASE = process.env.MULTITREND_BASE_URL || `http://${VM_HOST}`;
// 오케스트레이터 자체 API(대시보드 서버)는 nginx의 /orchestrator/ 아래에 있다.
const ORCH_API_BASE = process.env.ORCH_API_BASE_URL || `http://${VM_HOST}/orchestrator`;
const N8N_API_KEY = process.env.N8N_API_KEY || '';

// 단일 서비스 헬스 핑 (timeout 내 응답 = ok)
async function ping(url, timeoutMs = 6000) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.ok || res.status === 401 || res.status === 404, latencyMs: Date.now() - started };
    // 401/404도 "서버는 응답함"이므로 살아있는 것으로 간주
  } catch {
    clearTimeout(timer);
    return { ok: false, latencyMs: null };
  }
}

// 최근 실행 이력 (workflowId → 최신 1건). data가 최신순 정렬이므로 첫 매치만 채택.
async function fetchExecutionMap() {
  if (!N8N_API_KEY) return new Map();
  try {
    const res = await fetch(`${N8N_BASE}/api/v1/executions?limit=250`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return new Map();
    const json = await res.json();
    const items = json.data || [];
    const map = new Map();
    for (const ex of items) {
      const wfId = String(ex.workflowId);
      if (map.has(wfId)) continue;
      map.set(wfId, { startedAt: ex.startedAt || null, status: ex.status || (ex.finished ? 'success' : 'running') });
    }
    return map;
  } catch {
    return new Map();
  }
}

// n8n 워크플로 목록 (API 키 있을 때만)
async function fetchWorkflows(executionMap) {
  if (!N8N_API_KEY) return [];
  try {
    const res = await fetch(`${N8N_BASE}/api/v1/workflows?limit=50`, {
      headers: { 'X-N8N-API-KEY': N8N_API_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const items = json.data || json || [];
    return items.map((w) => ({
      id: String(w.id),
      name: w.name,
      active: !!w.active,
      lastExecution: executionMap.get(String(w.id)) ?? null,
    }));
  } catch {
    return [];
  }
}

// CNS 이벤트 (orchestrator 7070 살아있을 때만)
async function fetchCnsEvents() {
  try {
    const res = await fetch(`${ORCH_API_BASE}/api/cns/events`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const json = await res.json();
    const arr = json.events || json || [];
    return Array.isArray(arr) ? arr.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  const executionMap = await fetchExecutionMap();
  const [n8n, orchestrator, multiTrend, workflows, cnsEvents] = await Promise.all([
    ping(`${N8N_BASE}/healthz`),
    ping(`${ORCH_BASE}/api/orchestrator/snapshot`),
    ping(`${MT_BASE}/api/trending/hot`),
    fetchWorkflows(executionMap),
    fetchCnsEvents(),
  ]);

  const st = STATIC_SNAPSHOT?.status || {};
  const data = {
    services: { n8n, orchestrator, multiTrend },
    workflows,
    models: {
      live: st.live_models || [],
      dead: st.dead_models || [],
      checkedAt: st._meta?.last_checked || null,
    },
    cnsEvents,
  };

  res.status(200).json(data);
}
