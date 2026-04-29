/// <reference types="@cloudflare/workers-types" />

// Cloudflare Functions에서 Google Drive/Sheets를 호출하기 위한 공통 유틸

const DEFAULT_SHEET_ID = '19n-FIkuZHHAnEIoBo2MrCaQhFcifFDZFZRJqL0KYseU';
const DEFAULT_DRIVE_FOLDER_ID = '1lZnZbqVg3OTGTPvyy2xEuS7KT-i1apqc';
const DEFAULT_DRIVE_FALLBACK_PARENT_ID = '1_bH_GjcTYKUL9WnM9oo-YJDyJJoKMOiL';
const DEFAULT_DRIVE_TARGET_FOLDER_NAME = 'Multi-trend Dashboard DB';

const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface Env {
  GOOGLE_SERVICE_ACCOUNT: string;
  DASHBOARD_SHEET_ID?: string;
  DRIVE_FOLDER_ID?: string;
  DRIVE_FALLBACK_PARENT_ID?: string;
  DRIVE_TARGET_FOLDER_NAME?: string;
}

interface UploadFolderResult {
  folderId: string;
  folderName: string;
  mode: 'configured' | 'fallback-existing' | 'fallback-created';
}

interface DriveFileMeta {
  id: string;
  name?: string;
  parents?: string[];
  webViewLink?: string;
  createdTime?: string;
  modifiedTime?: string;
}

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const jsonResponse = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const toBase64UrlFromBytes = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

const toBase64UrlFromString = (value: string): string =>
  toBase64UrlFromBytes(new TextEncoder().encode(value));

const pemToPkcs8 = (pem: string): ArrayBuffer => {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const raw = atob(body);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
};

const isPermissionLikeError = (status: number, message: string): boolean => {
  const normalized = message.toLowerCase();
  return (
    status === 403 ||
    status === 404 ||
    normalized.includes('file not found') ||
    normalized.includes('insufficient') ||
    normalized.includes('permission')
  );
};

const escapeDriveQueryValue = (value: string): string => value.replace(/'/g, "\\'");

const normalizePrivateKey = (value: string): string => value.replace(/\\n/g, '\n');

const readServiceAccount = (env: Env): ServiceAccount => {
  if (!env.GOOGLE_SERVICE_ACCOUNT) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT 시크릿이 설정되지 않았습니다.');
  }
  const parsed = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT 값이 올바르지 않습니다.');
  }
  return {
    client_email: parsed.client_email,
    private_key: normalizePrivateKey(parsed.private_key),
  };
};

const getConfig = (env: Env) => ({
  sheetId: env.DASHBOARD_SHEET_ID ?? DEFAULT_SHEET_ID,
  driveFolderId: env.DRIVE_FOLDER_ID ?? DEFAULT_DRIVE_FOLDER_ID,
  fallbackParentId: env.DRIVE_FALLBACK_PARENT_ID ?? DEFAULT_DRIVE_FALLBACK_PARENT_ID,
  targetFolderName: env.DRIVE_TARGET_FOLDER_NAME ?? DEFAULT_DRIVE_TARGET_FOLDER_NAME,
});

export const getAccessToken = async (env: Env): Promise<string> => {
  const serviceAccount = readServiceAccount(env);
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64UrlFromString(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = toBase64UrlFromString(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const input = `${header}.${payload}`;
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    new TextEncoder().encode(input),
  );
  const assertion = `${input}.${toBase64UrlFromBytes(new Uint8Array(signature))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });

  if (!tokenRes.ok) {
    throw new Error(`Google OAuth 토큰 발급 실패: ${await tokenRes.text()}`);
  }
  const tokenPayload = (await tokenRes.json()) as { access_token?: string };
  if (!tokenPayload.access_token) {
    throw new Error('Google OAuth access_token을 받지 못했습니다.');
  }
  return tokenPayload.access_token;
};

const driveFileGet = async (token: string, fileId: string): Promise<DriveFileMeta> => {
  const url =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    '?fields=id,name,mimeType,parents,webViewLink,createdTime,modifiedTime&supportsAllDrives=true';
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return (await res.json()) as DriveFileMeta;
};

export const resolveUploadFolder = async (token: string, env: Env): Promise<UploadFolderResult> => {
  const config = getConfig(env);

  try {
    const folder = await driveFileGet(token, config.driveFolderId);
    return {
      folderId: folder.id,
      folderName: folder.name ?? config.targetFolderName,
      mode: 'configured',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 폴더 확인 실패';
    if (!isPermissionLikeError(0, message)) {
      throw new Error(`Drive 폴더 확인 실패: ${message}`);
    }
  }

  const parentRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(config.fallbackParentId)}?fields=id,name&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const parentText = await parentRes.text();
  if (!parentRes.ok) {
    throw new Error(`Drive 부모 폴더 접근 실패: ${parentText}`);
  }
  const parent = JSON.parse(parentText) as { id: string };

  const escapedName = escapeDriveQueryValue(config.targetFolderName);
  const query = encodeURIComponent(
    `'${parent.id}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${escapedName}'`,
  );
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const listText = await listRes.text();
  if (!listRes.ok) {
    throw new Error(`Drive 폴더 검색 실패: ${listText}`);
  }
  const listData = JSON.parse(listText) as { files?: Array<{ id: string; name: string }> };
  const found = listData.files?.[0];
  if (found?.id) {
    return {
      folderId: found.id,
      folderName: found.name,
      mode: 'fallback-existing',
    };
  }

  const createRes = await fetch(
    'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: config.targetFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parent.id],
      }),
    },
  );
  const createText = await createRes.text();
  if (!createRes.ok) {
    throw new Error(`Drive 폴더 생성 실패: ${createText}`);
  }
  const created = JSON.parse(createText) as { id: string; name: string };
  return {
    folderId: created.id,
    folderName: created.name,
    mode: 'fallback-created',
  };
};

export const getSpreadsheetMeta = async (token: string, env: Env): Promise<{ spreadsheetId: string; title: string }> => {
  const config = getConfig(env);
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}?fields=spreadsheetId,properties.title`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Spreadsheet 접근 실패: ${text}`);
  }
  const data = JSON.parse(text) as { spreadsheetId: string; properties?: { title?: string } };
  return { spreadsheetId: data.spreadsheetId, title: data.properties?.title ?? '' };
};

export const appendLectureRows = async (token: string, env: Env, rows: string[][]): Promise<void> => {
  const config = getConfig(env);
  const range = encodeURIComponent('lectures!A:H');
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: rows }),
    },
  );
  if (!res.ok) {
    throw new Error(`lectures 시트 기록 실패: ${await res.text()}`);
  }
};

export const getExistingLectureFileIdSet = async (token: string, env: Env): Promise<Set<string>> => {
  const config = getConfig(env);
  const range = encodeURIComponent('lectures!C2:C');
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${range}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`lectures 파일ID 조회 실패: ${text}`);
  }
  const data = JSON.parse(text) as { values?: string[][] };
  const set = new Set<string>();
  for (const row of data.values ?? []) {
    const fileId = String(row[0] ?? '').trim();
    if (fileId) {
      set.add(fileId);
    }
  }
  return set;
};

export const extractDriveFileId = (input: unknown): string => {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.includes('drive.google.com')) {
    const fromPath = raw.match(/\/d\/([A-Za-z0-9_-]+)/);
    if (fromPath?.[1]) {
      return fromPath[1];
    }
    const fromQuery = raw.match(/[?&]id=([A-Za-z0-9_-]+)/);
    if (fromQuery?.[1]) {
      return fromQuery[1];
    }
  }
  return raw;
};

export const isValidDriveFileId = (value: string): boolean => DRIVE_FILE_ID_PATTERN.test(value);

export const getDriveFileMeta = async (token: string, fileId: string): Promise<DriveFileMeta> => {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,parents,webViewLink,createdTime,modifiedTime&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Drive 파일 조회 실패: ${text}`);
  }
  return JSON.parse(text) as DriveFileMeta;
};

export const listFilesInFolder = async (token: string, folderId: string): Promise<DriveFileMeta[]> => {
  const files: DriveFileMeta[] = [];
  let pageToken = '';
  const query = encodeURIComponent(
    `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
  );

  while (true) {
    const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
    const url =
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=nextPageToken,files(id,name,webViewLink,createdTime,modifiedTime)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageParam}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Drive 폴더 파일 조회 실패: ${text}`);
    }
    const data = JSON.parse(text) as { nextPageToken?: string; files?: DriveFileMeta[] };
    files.push(...(data.files ?? []));
    if (!data.nextPageToken) {
      break;
    }
    pageToken = data.nextPageToken;
  }

  return files;
};

const buildMultipartBody = (
  boundary: string,
  metadata: Record<string, unknown>,
  mimeType: string,
  fileBytes: Uint8Array,
): Uint8Array => {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ),
    encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    fileBytes,
    encoder.encode(`\r\n--${boundary}--`),
  ];

  const total = parts.reduce((acc, part) => acc + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

export const uploadFileToDrive = async (
  token: string,
  folderId: string,
  file: File,
): Promise<{ driveFileId: string; driveFileUrl: string }> => {
  const boundary = `----Boundary${Date.now()}`;
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const body = buildMultipartBody(
    boundary,
    { name: file.name, parents: [folderId], mimeType: file.type || undefined },
    file.type || 'application/octet-stream',
    fileBytes,
  );

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Drive 업로드 실패: ${text}`);
  }
  const data = JSON.parse(text) as { id: string; webViewLink?: string };
  if (!data.id) {
    throw new Error('Drive 파일 ID를 받지 못했습니다.');
  }
  return {
    driveFileId: data.id,
    driveFileUrl: data.webViewLink ?? `https://drive.google.com/file/d/${data.id}/view`,
  };
};

export const clearTrendRowById = async (token: string, env: Env, trendId: string): Promise<boolean> => {
  const config = getConfig(env);
  const cleanId = String(trendId ?? '').trim();
  if (!cleanId) {
    return false;
  }

  const getRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodeURIComponent('trends!A2:A')}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  const getText = await getRes.text();
  if (!getRes.ok) {
    throw new Error(`trends ID 조회 실패: ${getText}`);
  }

  const data = JSON.parse(getText) as { values?: string[][] };
  const values = data.values ?? [];
  const foundIndex = values.findIndex((row) => String(row[0] ?? '').trim() === cleanId);
  if (foundIndex < 0) {
    return false;
  }

  const rowNumber = foundIndex + 2; // A2부터 시작
  const clearRange = `trends!A${rowNumber}:Z${rowNumber}`;
  const clearRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${config.sheetId}/values/${encodeURIComponent(clearRange)}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    },
  );

  if (!clearRes.ok) {
    throw new Error(`trends 행 삭제 실패: ${await clearRes.text()}`);
  }

  return true;
};

export const getSheetId = (env: Env): string => getConfig(env).sheetId;
