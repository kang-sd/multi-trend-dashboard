// Vercel Edge Function: POST /api/lectures/register-drive-file

import {
  CORS_HEADERS,
  appendLectureRows,
  extractDriveFileId,
  getAccessToken,
  getDriveFileMeta,
  getEnvFromProcess,
  getExistingLectureFileIdSet,
  isValidDriveFileId,
  jsonResponse,
  resolveUploadFolder,
} from '../_google';

interface RegisterBody {
  title?: string;
  speaker?: string;
  tags?: string;
  summary?: string;
  driveFileInput?: string;
}

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = (await req.json()) as RegisterBody;
    const title = String(body.title ?? '').trim();
    const speaker = String(body.speaker ?? '').trim() || '작성자';
    const tags = String(body.tags ?? '').trim() || 'manual';
    const summary = String(body.summary ?? '').trim() || '수동 업로드 파일 등록';
    const driveFileId = extractDriveFileId(body.driveFileInput);

    if (!title) {
      return jsonResponse({ error: '제목을 입력해 주세요.' }, 400);
    }
    if (!driveFileId || !isValidDriveFileId(driveFileId)) {
      return jsonResponse({ error: '유효한 Drive 파일 링크 또는 ID를 입력해 주세요.' }, 400);
    }

    const env = getEnvFromProcess();
    const token = await getAccessToken(env);
    const uploadFolder = await resolveUploadFolder(token, env);
    const existingFileIds = await getExistingLectureFileIdSet(token, env);

    if (existingFileIds.has(driveFileId)) {
      return jsonResponse(
        {
          alreadyRegistered: true,
          driveFileId,
          driveFileUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
        },
        200,
      );
    }

    const driveFile = await getDriveFileMeta(token, driveFileId);
    const parents = driveFile.parents ?? [];
    if (!parents.includes(uploadFolder.folderId)) {
      return jsonResponse(
        { error: '해당 파일이 Multi-trend Dashboard DB 폴더에 없습니다. 먼저 폴더로 이동해 주세요.' },
        400,
      );
    }

    const lectureId = `lecture-${Date.now()}`;
    const nowIso = new Date().toISOString();
    await appendLectureRows(token, env, [[lectureId, title, driveFileId, speaker, tags, summary, nowIso, nowIso]]);

    return jsonResponse(
      {
        id: lectureId,
        title,
        driveFileId,
        driveFileUrl: driveFile.webViewLink ?? `https://drive.google.com/file/d/${driveFileId}/view`,
        uploadFolderId: uploadFolder.folderId,
        uploadFolderMode: uploadFolder.mode,
        published: nowIso,
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 파일 등록 실패';
    return jsonResponse({ error: message }, 500);
  }
}
