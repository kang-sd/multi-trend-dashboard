import type {
  DashboardDataSnapshot,
  LectureRecord,
  ModelHealthRecord,
  OrchestratorConfig,
  OrchestratorSnapshot,
  TrendRecord,
  YoutubeVideo,
} from '../types/dashboard';

const SHEET_ID = '19n-FIkuZHHAnEIoBo2MrCaQhFcifFDZFZRJqL0KYseU';
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const N8N_WEBHOOK_BASE = import.meta.env.VITE_N8N_WEBHOOK_BASE ?? 'http://localhost:5678';
const MODEL_HEALTHCHECK_RUN_API_URL =
  import.meta.env.VITE_MODEL_HEALTHCHECK_RUN_API_URL ?? 'http://127.0.0.1:8787/api/model-health/run';
const MODEL_HEALTHCHECK_WEBHOOK_URL =
  import.meta.env.VITE_N8N_HEALTHCHECK_WEBHOOK_URL ??
  `${N8N_WEBHOOK_BASE.replace(/\/$/, '')}/webhook/ai-model-healthcheck`;
const ORCHESTRATOR_API_BASE = `${API_BASE_URL}/orchestrator`;

const APP_IMAGE_FALLBACK =
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=800';
const LECTURE_IMAGE_FALLBACK =
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=800';

type GoogleVizValue = string | number | boolean | null;

interface GoogleVizCell {
  v?: GoogleVizValue;
}

interface GoogleVizRow {
  c?: Array<GoogleVizCell | null>;
}

interface GoogleVizResponse {
  table?: {
    rows?: GoogleVizRow[];
  };
}

interface SheetLoadResult<T> {
  items: T[];
  warning?: string;
}

export async function loadWithRetry<T, K>(
  loader: () => Promise<T[]>,
  beforeIds: Set<K>,
  getId: (item: T) => K,
  maxAttempts = 3,
  delayMs = 1500,
): Promise<{ items: T[]; appended: T[] }> {
  let lastItems: T[] = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const items = await loader();
    const appended = items.filter((item) => !beforeIds.has(getId(item)));
    lastItems = items;

    if (appended.length > 0) {
      return { items, appended };
    }
  }

  return { items: lastItems, appended: [] };
}

export interface UploadLecturePayload {
  title: string;
  speaker: string;
  tags: string;
  summary: string;
  file: File;
}

export interface UploadLectureResult {
  id: string;
  title: string;
  driveFileId: string;
  driveFileUrl: string;
  published: string;
  alreadyRegistered?: boolean;
}

export interface RegisterDriveLecturePayload {
  title: string;
  speaker: string;
  tags: string;
  summary: string;
  driveFileInput: string;
}

export interface SyncLecturesResult {
  addedCount: number;
  skippedCount: number;
  totalInFolder: number;
}

const readText = (cells: Array<GoogleVizCell | null>, index: number): string => {
  const raw = cells[index]?.v;
  if (raw === null || raw === undefined) {
    return '';
  }
  return String(raw).trim();
};

const readNumber = (cells: Array<GoogleVizCell | null>, index: number): number | null => {
  const raw = cells[index]?.v;
  if (typeof raw === 'number') {
    return raw;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const readBoolean = (cells: Array<GoogleVizCell | null>, index: number): boolean => {
  const raw = cells[index]?.v;
  if (typeof raw === 'boolean') {
    return raw;
  }

  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
};

const parseGoogleVizResponse = (rawText: string): GoogleVizResponse => {
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('Google Sheets 응답 파싱에 실패했습니다.');
  }

  const jsonPayload = rawText.slice(firstBrace, lastBrace + 1);
  return JSON.parse(jsonPayload) as GoogleVizResponse;
};

const fetchSheetRows = async (sheetName: string): Promise<GoogleVizRow[]> => {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${sheetName} 시트 호출 실패 (${response.status})`);
  }

  const rawText = await response.text();
  const parsed = parseGoogleVizResponse(rawText);
  return parsed.table?.rows ?? [];
};

const loadSheet = async <T>(
  sheetName: string,
  mapper: (cells: Array<GoogleVizCell | null>) => T | null,
): Promise<SheetLoadResult<T>> => {
  try {
    const rows = await fetchSheetRows(sheetName);
    const items = rows
      .map((row) => mapper(row.c ?? []))
      .filter((item): item is T => item !== null);

    return { items };
  } catch {
    return {
      items: [],
      warning: `${sheetName} 시트를 불러오지 못했습니다.`,
    };
  }
};


const mapTrendRow = (cells: Array<GoogleVizCell | null>): TrendRecord | null => {
  const id = readText(cells, 0);
  // 헤더 행만 건너뜀 (id='id' 인 경우)
  if (!id || id.toLowerCase() === 'id') return null;

  const title = readText(cells, 2);
  const summary = readText(cells, 4);
  // title과 summary 모두 비어있으면 의미 없는 행 → 건너뜀
  if (!title && !summary) return null;

  return {
    id,
    source: readText(cells, 1) || 'Google News RSS',
    title: title || summary.slice(0, 60) || '(제목 없음)',  // title 없으면 summary 앞부분 사용
    link: readText(cells, 3),
    summary,
    score: readNumber(cells, 5),
    date: readText(cells, 6),
    image: readText(cells, 7),
    keyFacts: readText(cells, 8),
    whyImportant: readText(cells, 9),
    industryImpact: readText(cells, 10),
    actionPoint: readText(cells, 11),
    causalAnalysis: readText(cells, 12),
    secondOrderEffect: readText(cells, 13),
    forecast3m: readText(cells, 14),
    forecast12m: readText(cells, 15),
    scenarioBase: readText(cells, 16),
    scenarioBull: readText(cells, 17),
    scenarioBear: readText(cells, 18),
    probabilityBase: readNumber(cells, 19),
    probabilityBull: readNumber(cells, 20),
    probabilityBear: readNumber(cells, 21),
    confidence: readText(cells, 22),
    evidenceQuality: readText(cells, 23),
    glossaryTerms: readText(cells, 24),
    footnotes: readText(cells, 25),
  };
};

const mapLectureRow = (cells: Array<GoogleVizCell | null>): LectureRecord | null => {
  const id = readText(cells, 0);
  const title = readText(cells, 1);

  if (!id || id.toLowerCase() === 'id' || !title || title.toLowerCase() === 'title') {
    return null;
  }

  const driveFileId = readText(cells, 2);
  const normalizedTitle = title.trim().toLowerCase();
  if (normalizedTitle === 'dashboard_db' || driveFileId === SHEET_ID) {
    return null;
  }

  const directLink = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/preview` : '';

  return {
    id,
    title,
    driveFileId,
    speaker: readText(cells, 3) || 'Unknown Speaker',
    tags: readText(cells, 4),
    summary: readText(cells, 5),
    published: readText(cells, 6),
    updatedAt: readText(cells, 7),
    link: directLink,
  };
};

const mapYoutubeRow = (cells: Array<GoogleVizCell | null>): YoutubeVideo | null => {
  const videoId = readText(cells, 0);
  // 헤더 행 건너뜀
  if (!videoId || videoId.toLowerCase() === 'video_id') return null;

  const channelName = readText(cells, 1);
  const channelHandle = readText(cells, 2);
  const channelId = readText(cells, 3);

  return {
    videoId,
    channelName,
    channelHandle,
    channelId,
    title: readText(cells, 4),
    published: readText(cells, 5),
    thumbnailUrl: readText(cells, 6),
    videoUrl: readText(cells, 7),
    color: readText(cells, 8) || '#2563eb',
    topicCluster: readText(cells, 9),
    contentType: readText(cells, 10),
    oneLineSummary: readText(cells, 11),
    strategicAngle: readText(cells, 12),
    relatedTrendId: readText(cells, 13),
    relatedProjectId: readText(cells, 14),
    relatedLectureId: readText(cells, 15),
    isFeatured: readBoolean(cells, 16),
    language: readText(cells, 17) || 'ko',
    durationBucket: readText(cells, 18),
    collectedAt: readText(cells, 19),
  };
};

export const loadDashboardData = async (): Promise<DashboardDataSnapshot> => {
  const [trendsResult, lecturesResult] = await Promise.all([
    loadSheet('trends', mapTrendRow),
    loadSheet('lectures', mapLectureRow),
  ]);

  const warnings = [trendsResult.warning, lecturesResult.warning].filter(
    (warning): warning is string => Boolean(warning),
  );

  return {
    trends: trendsResult.items,
    lectures: lecturesResult.items,
    warnings,
    lastSyncAt: new Date().toISOString(),
  };
};

export const uploadLectureToDrive = async (payload: UploadLecturePayload): Promise<UploadLectureResult> => {
  const formData = new FormData();
  formData.append('title', payload.title);
  formData.append('speaker', payload.speaker);
  formData.append('tags', payload.tags);
  formData.append('summary', payload.summary);
  formData.append('file', payload.file);

  const response = await fetch(`${API_BASE_URL}/lectures/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let message = '강의자료 업로드에 실패했습니다.';
    try {
      const errorPayload = (await response.json()) as { error?: string };
      if (errorPayload.error) {
        message = errorPayload.error;
      }
    } catch {
      // 파싱 실패 시 기본 메시지 유지
    }
    throw new Error(message);
  }

  return (await response.json()) as UploadLectureResult;
};

export const registerLectureByDriveFile = async (
  payload: RegisterDriveLecturePayload,
): Promise<UploadLectureResult> => {
  const response = await fetch(`${API_BASE_URL}/lectures/register-drive-file`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = 'Drive 파일 등록에 실패했습니다.';
    try {
      const errorPayload = (await response.json()) as { error?: string };
      if (errorPayload.error) {
        message = errorPayload.error;
      }
    } catch {
      // 파싱 실패 시 기본 메시지 유지
    }
    throw new Error(message);
  }

  return (await response.json()) as UploadLectureResult;
};

export const syncLecturesFromDriveFolder = async (): Promise<SyncLecturesResult> => {
  const response = await fetch(`${API_BASE_URL}/lectures/sync-folder`, {
    method: 'POST',
  });

  if (!response.ok) {
    let message = 'Drive 폴더 동기화에 실패했습니다.';
    try {
      const errorPayload = (await response.json()) as { error?: string };
      if (errorPayload.error) {
        message = errorPayload.error;
      }
    } catch {
      // 파싱 실패 시 기본 메시지 유지
    }
    throw new Error(message);
  }

  return (await response.json()) as SyncLecturesResult;
};

export const deleteTrendReportById = async (id: string): Promise<void> => {
  const targetId = id.trim();
  if (!targetId) {
    throw new Error('삭제할 보고서 ID가 없습니다.');
  }

  const response = await fetch(`${API_BASE_URL}/trends/delete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: targetId }),
  });

  if (!response.ok) {
    let message = '보고서 삭제에 실패했습니다.';
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) {
        message = payload.error;
      }
    } catch {
      // 파싱 실패 시 기본 메시지 유지
    }
    throw new Error(message);
  }
};

export const loadYoutubeVideos = async (): Promise<YoutubeVideo[]> => {
  const result = await loadSheet('youtube_videos', mapYoutubeRow);
  return result.items;
};

export const triggerYoutubeSync = async (): Promise<{ success: boolean }> => {
  try {
    const response = await fetch(`${N8N_WEBHOOK_BASE.replace(/\/$/, '')}/webhook/youtube-sync`);
    return { success: response.ok };
  } catch {
    return { success: false };
  }
};

export interface TriggerHealthcheckResult {
  success: boolean;
  message: string;
}

export const triggerModelHealthcheck = async (): Promise<TriggerHealthcheckResult> => {
  try {
    const response = await fetch(MODEL_HEALTHCHECK_RUN_API_URL, { method: 'POST' });
    if (response.ok) {
      return { success: true, message: '헬스체크 실행 및 시트 갱신이 완료되었습니다.' };
    }
  } catch {
    // 로컬 API 미실행 시 webhook 경로로 폴백
  }

  try {
    const response = await fetch(MODEL_HEALTHCHECK_WEBHOOK_URL);
    if (response.ok) {
      return { success: true, message: '헬스체크 워크플로우 실행 요청이 접수되었습니다.' };
    }

    return {
      success: false,
      message: `헬스체크 실행 실패 (${response.status}). 웹훅 경로 또는 n8n 상태를 확인하세요.`,
    };
  } catch {
    return {
      success: false,
      message:
        'n8n 또는 로컬 API에 연결할 수 없습니다. `npm run dev:api` 실행 후 다시 시도하거나 VITE_MODEL_HEALTHCHECK_RUN_API_URL/VITE_N8N_HEALTHCHECK_WEBHOOK_URL을 설정하세요.',
    };
  }
};

// model_health 시트: model_id | status | latency_ms | checked_at | error_msg
const mapModelHealthRow = (cells: Array<GoogleVizCell | null>): ModelHealthRecord | null => {
  const modelId = readText(cells, 0);
  if (!modelId || modelId.toLowerCase() === 'model_id') return null;
  const status = readText(cells, 1) as ModelHealthRecord['status'];
  return {
    modelId,
    status: ['ok', 'error'].includes(status) ? status : 'unknown',
    latencyMs: readNumber(cells, 2),
    checkedAt: readText(cells, 3),
    errorMsg: readText(cells, 4),
  };
};

export const loadModelHealth = async (): Promise<ModelHealthRecord[]> => {
  const result = await loadSheet('model_health', mapModelHealthRow);
  return result.items;
};

export const loadOrchestratorConfig = async (): Promise<OrchestratorConfig | null> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_BASE}/configs`);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      ok: boolean;
      configs?: Array<{ ok: boolean; config: OrchestratorConfig | null }>;
    };
    const firstValidConfig = data.configs?.find((item) => item.ok && item.config)?.config ?? null;
    return firstValidConfig;
  } catch {
    return null;
  }
};

export const loadOrchestratorSnapshot = async (): Promise<OrchestratorSnapshot | null> => {
  try {
    const response = await fetch(`${ORCHESTRATOR_API_BASE}/snapshot`);
    if (!response.ok) return null;
    return (await response.json()) as OrchestratorSnapshot;
  } catch {
    try {
      const response = await fetch('/orchestrator/snapshot.json');
      if (!response.ok) return null;
      return (await response.json()) as OrchestratorSnapshot;
    } catch {
      return null;
    }
  }
};

export {
  APP_IMAGE_FALLBACK,
  LECTURE_IMAGE_FALLBACK,
};
