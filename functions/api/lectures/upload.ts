/// <reference types="@cloudflare/workers-types" />

import {
  CORS_HEADERS,
  appendLectureRows,
  getAccessToken,
  jsonResponse,
  resolveUploadFolder,
  uploadFileToDrive,
  type Env,
} from '../_google';

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = String(formData.get('title') ?? '').trim();
    const speaker = String(formData.get('speaker') ?? '').trim() || '작성자';
    const tags = String(formData.get('tags') ?? '').trim() || 'lecture';
    const summary = String(formData.get('summary') ?? '').trim() || '요약 미입력';

    if (!title) {
      return jsonResponse({ error: '제목을 입력해 주세요.' }, 400);
    }
    if (!file) {
      return jsonResponse({ error: '파일이 없습니다.' }, 400);
    }

    const token = await getAccessToken(env);
    const uploadFolder = await resolveUploadFolder(token, env);
    const uploaded = await uploadFileToDrive(token, uploadFolder.folderId, file);

    const lectureId = `lecture-${Date.now()}`;
    const nowIso = new Date().toISOString();

    await appendLectureRows(token, env, [
      [lectureId, title, uploaded.driveFileId, speaker, tags, summary, nowIso, nowIso],
    ]);

    return jsonResponse(
      {
        id: lectureId,
        title,
        driveFileId: uploaded.driveFileId,
        driveFileUrl: uploaded.driveFileUrl,
        uploadFolderId: uploadFolder.folderId,
        uploadFolderMode: uploadFolder.mode,
        published: nowIso,
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '업로드 처리 실패';
    return jsonResponse({ error: message }, 500);
  }
};

