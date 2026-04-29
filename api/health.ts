// Vercel Edge Function: /api/health

import {
  CORS_HEADERS,
  getAccessToken,
  getEnvFromProcess,
  getSheetId,
  getSpreadsheetMeta,
  jsonResponse,
  resolveUploadFolder,
} from './_google';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const env = getEnvFromProcess();
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
      authMode: 'vercel_service_account_env',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '환경 설정 확인 실패';
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
