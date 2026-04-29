/// <reference types="@cloudflare/workers-types" />

import {
  CORS_HEADERS,
  clearTrendRowById,
  getAccessToken,
  jsonResponse,
  type Env,
} from '../_google';

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  try {
    const body = (await request.json()) as { id?: string };
    const targetId = String(body?.id ?? '').trim();
    if (!targetId) {
      return jsonResponse({ error: '삭제할 보고서 ID가 필요합니다.' }, 400);
    }

    const token = await getAccessToken(env);
    const deleted = await clearTrendRowById(token, env, targetId);
    if (!deleted) {
      return jsonResponse({ error: '해당 보고서를 찾지 못했습니다.' }, 404);
    }

    return jsonResponse({ ok: true, deletedId: targetId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'trends 삭제 실패';
    return jsonResponse({ error: message }, 500);
  }
};
