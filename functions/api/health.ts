/// <reference types="@cloudflare/workers-types" />

import {
  CORS_HEADERS,
  getAccessToken,
  getSheetId,
  getSpreadsheetMeta,
  jsonResponse,
  resolveUploadFolder,
  type Env,
} from './_google';

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: CORS_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const token = await getAccessToken(env);
    const folder = await resolveUploadFolder(token, env);
    const sheet = await getSpreadsheetMeta(token, env);

    return jsonResponse({
      ok: true,
      configuredFolderId: env.DRIVE_FOLDER_ID ?? '1lZnZbqVg3OTGTPvyy2xEuS7KT-i1apqc',
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderResolveMode: folder.mode,
      sheetId: getSheetId(env),
      sheetTitle: sheet.title,
      authMode: 'cloudflare_service_account_secret',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '환경 설정 확인 실패';
    return jsonResponse({ ok: false, error: message }, 500);
  }
};

