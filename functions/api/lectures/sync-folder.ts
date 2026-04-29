/// <reference types="@cloudflare/workers-types" />

import {
  CORS_HEADERS,
  appendLectureRows,
  getAccessToken,
  getExistingLectureFileIdSet,
  getSheetId,
  jsonResponse,
  listFilesInFolder,
  resolveUploadFolder,
  type Env,
} from '../_google';

export const onRequestOptions: PagesFunction = async () => new Response(null, { headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<Env> = async ({ env }) => {
  try {
    const token = await getAccessToken(env);
    const uploadFolder = await resolveUploadFolder(token, env);
    const existingFileIds = await getExistingLectureFileIdSet(token, env);
    const files = await listFilesInFolder(token, uploadFolder.folderId);
    const sheetId = getSheetId(env);

    const newFiles = files.filter((file) => {
      if (!file.id) {
        return false;
      }
      if (file.id === sheetId) {
        return false;
      }
      if ((file.name ?? '').trim().toLowerCase() === 'dashboard_db') {
        return false;
      }
      return !existingFileIds.has(file.id);
    });
    if (!newFiles.length) {
      return jsonResponse({
        addedCount: 0,
        skippedCount: files.length,
        totalInFolder: files.length,
        uploadFolderId: uploadFolder.folderId,
        uploadFolderMode: uploadFolder.mode,
      });
    }

    const baseTime = Date.now();
    const rows = newFiles.map((file, index) => {
      const timestamp = new Date(baseTime + index).toISOString();
      return [
        `lecture-${baseTime + index}`,
        file.name ?? `수동 업로드 파일 ${index + 1}`,
        file.id,
        '작성자',
        'manual',
        'Drive 폴더 수동 업로드 파일 자동 등록',
        file.createdTime ?? timestamp,
        file.modifiedTime ?? timestamp,
      ];
    });

    await appendLectureRows(token, env, rows);

    return jsonResponse({
      addedCount: newFiles.length,
      skippedCount: files.length - newFiles.length,
      totalInFolder: files.length,
      uploadFolderId: uploadFolder.folderId,
      uploadFolderMode: uploadFolder.mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 폴더 동기화 실패';
    return jsonResponse({ error: message }, 500);
  }
};
