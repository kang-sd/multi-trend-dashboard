/**
 * Cloudflare Function: /api/search
 * On-Demand AI 뉴스 검색 프록시
 * 프론트엔드 → 이 함수 → n8n 웹훅 (로컬 or 외부)
 *
 * 환경변수 (Cloudflare Pages 대시보드에서 설정):
 *   N8N_WEBHOOK_BASE: n8n 외부 접근 URL (예: https://xxx.ngrok.io)
 *                     미설정 시 로컬 전용으로 동작 불가 안내
 */

interface Env {
  N8N_WEBHOOK_BASE?: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const keyword = url.searchParams.get('keyword') ?? '';

  if (!keyword.trim()) {
    return new Response(JSON.stringify({ error: '검색어가 필요합니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // n8n 웹훅 베이스 URL (환경변수 우선, 없으면 503)
  const n8nBase = env.N8N_WEBHOOK_BASE?.replace(/\/$/, '');

  if (!n8nBase) {
    return new Response(
      JSON.stringify({
        error: 'N8N_WEBHOOK_BASE 환경변수가 설정되지 않았습니다. Cloudflare Pages 대시보드에서 설정하세요.',
        hint: 'ngrok 등으로 n8n을 외부에 노출한 후 URL을 설정하세요.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  try {
    const n8nUrl = `${n8nBase}/webhook/ondemand-search?keyword=${encodeURIComponent(keyword)}`;

    const n8nRes = await fetch(n8nUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'MultiTrendDashboard-CF-Proxy/1.0',
        'ngrok-skip-browser-warning': 'true', // ngrok 경고 페이지 우회
      },
      // n8n lastNode 모드: 워크플로우 완료까지 대기 (3기사 × 약 30s = 최대 90s)
      signal: AbortSignal.timeout(120000),
    });

    const body = await n8nRes.text();

    return new Response(body, {
      status: n8nRes.status,
      headers: {
        'Content-Type': n8nRes.headers.get('Content-Type') ?? 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'n8n 연결 실패', detail: message }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
};

// CORS preflight
export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
