// Vercel Edge Function: /api/search
// 프론트엔드 → 이 함수 → n8n 웹훅

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const url = new URL(req.url);
  const keyword = url.searchParams.get('keyword') ?? '';

  if (!keyword.trim()) {
    return new Response(JSON.stringify({ error: '검색어가 필요합니다.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Vercel Edge는 raw IP 직접 접근 차단 → IP를 nip.io 도메인으로 자동 변환
  let n8nBase = (process.env.N8N_WEBHOOK_BASE ?? '').replace(/\/$/, '');
  n8nBase = n8nBase.replace(/(https?:\/\/)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/, '$1$2.nip.io');

  if (!n8nBase) {
    return new Response(
      JSON.stringify({
        error: 'N8N_WEBHOOK_BASE 환경변수가 설정되지 않았습니다. Vercel 대시보드에서 설정하세요.',
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
        'User-Agent': 'MultiTrendDashboard-Vercel-Proxy/1.0',
        'ngrok-skip-browser-warning': 'true',
      },
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
}
