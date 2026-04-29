import { Readable } from 'node:stream';
import { access, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import multer from 'multer';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.UPLOAD_API_PORT ?? 8787);
const DASHBOARD_SHEET_ID =
  process.env.DASHBOARD_SHEET_ID ?? '19n-FIkuZHHAnEIoBo2MrCaQhFcifFDZFZRJqL0KYseU';
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID ?? '1lZnZbqVg3OTGTPvyy2xEuS7KT-i1apqc';
const DRIVE_FALLBACK_PARENT_ID = process.env.DRIVE_FALLBACK_PARENT_ID ?? '1_bH_GjcTYKUL9WnM9oo-YJDyJJoKMOiL';
const DRIVE_TARGET_FOLDER_NAME = process.env.DRIVE_TARGET_FOLDER_NAME ?? 'Multi-trend Dashboard DB';
const GOOGLE_AUTH_MODE = process.env.GOOGLE_AUTH_MODE ?? 'service_account';
const GOOGLE_SERVICE_ACCOUNT_PATH =
  process.env.GOOGLE_SERVICE_ACCOUNT_PATH ??
  'E:\\Projects\\kquant\\kquant_collector\\service-account.json';
const DRIVE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]{10,}$/;
const MODEL_HEALTHCHECK_SCRIPT_PATH =
  process.env.MODEL_HEALTHCHECK_SCRIPT_PATH ?? 'E:\\vault\\n8n\\run_healthcheck_now.js';
const ORCHESTRATOR_DIR = path.join(__dirname, 'orchestrator');
const ORCHESTRATOR_PATHS = {
  status: path.join(ORCHESTRATOR_DIR, 'model_status.json'),
  bindings: path.join(ORCHESTRATOR_DIR, 'project_model_bindings.json'),
  changelog: path.join(ORCHESTRATOR_DIR, 'change_log.json'),
  legacyDashboard: path.join(ORCHESTRATOR_DIR, 'dashboard.html'),
  fetchModelsScript: path.join(ORCHESTRATOR_DIR, 'fetch_free_models.js'),
  replaceScript: path.join(ORCHESTRATOR_DIR, 'auto_replace.js'),
  initFirestoreScript: path.join(ORCHESTRATOR_DIR, 'init_firestore.js'),
  repairAutoswitchScript: path.join(ORCHESTRATOR_DIR, 'update_n8n_autoswitch.js'),
};
const ORCHESTRATOR_VAULT_PATH = 'E:\\vault\\api_vault.json';
const ORCHESTRATOR_PROJECTS = [
  {
    bindingProjectId: 'CommonAI',
    dashboardProjectId: 'commonai',
    displayName: 'CommonAI',
  },
  {
    bindingProjectId: 'career-final',
    dashboardProjectId: 'career-aptitude',
    displayName: '직업진로 탐색',
    endpoint: 'https://us-central1-career-aptitude-final.cloudfunctions.net/orchestratorUpdate',
  },
  {
    bindingProjectId: 'healthy-final',
    dashboardProjectId: 'healthy',
    displayName: '건강 AI 어드바이저',
    endpoint: 'https://us-central1-healthy-final.cloudfunctions.net/orchestratorUpdate',
  },
  {
    bindingProjectId: 'mbti-final',
    dashboardProjectId: 'mbti',
    displayName: 'MBTI AI 성격 분석',
    endpoint: 'https://us-central1-mbti-final.cloudfunctions.net/orchestratorUpdate',
  },
  {
    bindingProjectId: 'tarot-final',
    dashboardProjectId: 'tarot',
    displayName: '타로 카드 AI 리딩',
    endpoint: 'https://us-central1-tarot-final-1b241.cloudfunctions.net/orchestratorUpdate',
  },
  {
    bindingProjectId: 'values-test-final',
    dashboardProjectId: 'values',
    displayName: '가치관 테스트',
    endpoint: 'https://us-central1-values-test-final.cloudfunctions.net/orchestratorUpdate',
  },
  {
    bindingProjectId: 'core-competencies-final',
    dashboardProjectId: 'core-competencies',
    displayName: '핵심역량 진단',
    endpoint: 'https://us-central1-core-competencies-finai.cloudfunctions.net/orchestratorUpdate',
  },
  {
    bindingProjectId: 'multiple-intelligence-final',
    dashboardProjectId: 'multiple-intelligence',
    displayName: '다중지능 검사',
    endpoint: 'https://us-central1-multiple-intelligence-final.cloudfunctions.net/orchestratorUpdate',
  },
  {
    bindingProjectId: 'saju-kang',
    dashboardProjectId: 'saju',
    displayName: '사주팔자 AI 분석',
  },
  {
    bindingProjectId: 'Lotto-generation',
    dashboardProjectId: 'lotto',
    displayName: '로또 번호 생성기',
  },
  {
    bindingProjectId: 'Pension-lottery',
    dashboardProjectId: 'pension',
    displayName: '연금복권 분석기',
  },
  {
    bindingProjectId: 'kquant',
    dashboardProjectId: 'kquant',
    displayName: 'KQuant 주식 분석',
  },
  {
    bindingProjectId: 'multi-trend-dashboard-n8n',
    dashboardProjectId: 'multi-trend',
    displayName: 'Multi-trend n8n',
  },
  {
    bindingProjectId: 'cloudflare-multi-trend-dashboard',
    dashboardProjectId: 'multi-trend',
    displayName: 'Multi-trend Dashboard',
  },
  {
    bindingProjectId: 'cloudflare-korea-law',
    dashboardProjectId: 'korean-law',
    displayName: '대한민국 법령 가이드',
  },
];
const ORCHESTRATOR_PROVIDER_META = {
  Cerebras: { key: 'CEREBRAS_API_KEY', emoji: '🧠', desc: '초고속 추론' },
  Groq: { key: 'GROQ_API_KEY', emoji: '⚡', desc: 'LPU 초저지연' },
  OpenRouter: { key: 'OPENROUTER_API_KEY', emoji: '🌐', desc: '멀티모델 라우팅' },
  HuggingFace: { key: 'HF_TOKEN', emoji: '🤗', desc: '오픈소스 허브' },
  Gemini: { key: 'GEMINI_API_KEY', emoji: '💎', desc: 'Google 멀티모달' },
  Chutes: { key: 'CHUTES_API_KEY', emoji: '🔗', desc: '분산 추론' },
  Hyperbolic: { key: 'HYPERBOLIC_API_KEY', emoji: '📐', desc: 'GPU 클라우드' },
  Cohere: { key: 'COHERE_API_KEY', emoji: '🔮', desc: '엔터프라이즈 NLP' },
  SambaNova: { key: 'SAMBANOVA_API_KEY', emoji: '🚀', desc: 'RDU 전용 칩' },
  DeepSeek: { key: 'DEEPSEEK_API_KEY', emoji: '🔍', desc: '오픈소스 추론' },
  Cloudflare: { key: null, emoji: '☁️', desc: 'Workers AI 엣지' },
  Ollama: { key: null, emoji: '🦙', desc: '로컬 모델 런타임' },
};

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});
app.use(express.json());
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

let apiClientsPromise;
let resolvedFolderPromise;

const readJsonFile = async (filePath, fallbackValue) => {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
};

const ensureJsonFile = async (filePath, defaultValue) => {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
  }
};

const ensureConfig = async () => {
  if (!DASHBOARD_SHEET_ID || !DRIVE_FOLDER_ID) {
    throw new Error('DASHBOARD_SHEET_ID 또는 DRIVE_FOLDER_ID가 설정되지 않았습니다.');
  }
  if (GOOGLE_AUTH_MODE === 'service_account') {
    await access(GOOGLE_SERVICE_ACCOUNT_PATH);
  }
};

const isPermissionLikeError = (message) => {
  const normalized = message.toLowerCase();
  return normalized.includes('file not found') || normalized.includes('insufficient') || normalized.includes('permission');
};

const escapeDriveQueryValue = (value) => value.replace(/'/g, "\\'");

const getAccessibleFolder = async (drive, fileId) => {
  const response = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType',
    supportsAllDrives: true,
  });
  return response.data;
};

const resolveUploadFolder = async (drive) => {
  try {
    const folder = await getAccessibleFolder(drive, DRIVE_FOLDER_ID);
    return {
      folderId: folder.id,
      folderName: folder.name,
      mode: 'configured',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 폴더 확인 실패';
    if (!isPermissionLikeError(message)) {
      throw error;
    }

    const parentFolder = await getAccessibleFolder(drive, DRIVE_FALLBACK_PARENT_ID);
    const escapedName = escapeDriveQueryValue(DRIVE_TARGET_FOLDER_NAME);

    const existingFolder = await drive.files.list({
      q: `'${parentFolder.id}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${escapedName}'`,
      fields: 'files(id,name)',
      pageSize: 1,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    const found = existingFolder.data.files?.[0];
    if (found?.id) {
      return {
        folderId: found.id,
        folderName: found.name,
        mode: 'fallback-existing',
      };
    }

    const createdFolder = await drive.files.create({
      requestBody: {
        name: DRIVE_TARGET_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolder.id],
      },
      fields: 'id,name',
      supportsAllDrives: true,
    });

    return {
      folderId: createdFolder.data.id,
      folderName: createdFolder.data.name,
      mode: 'fallback-created',
    };
  }
};

const getUploadFolder = async (drive) => {
  if (!resolvedFolderPromise) {
    resolvedFolderPromise = resolveUploadFolder(drive);
  }
  return resolvedFolderPromise;
};

const extractDriveFileId = (input) => {
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

const getExistingLectureFileIdSet = async (sheets) => {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: DASHBOARD_SHEET_ID,
    range: 'lectures!C2:C',
  });
  const values = response.data.values ?? [];
  return new Set(values.map((row) => String(row[0] ?? '').trim()).filter(Boolean));
};

const appendLectureRows = async (sheets, values) => {
  await sheets.spreadsheets.values.append({
    spreadsheetId: DASHBOARD_SHEET_ID,
    range: 'lectures!A:H',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
};

const clearTrendRowById = async (sheets, trendId) => {
  const cleanId = String(trendId ?? '').trim();
  if (!cleanId) {
    return false;
  }

  const idsResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: DASHBOARD_SHEET_ID,
    range: 'trends!A2:A',
  });
  const ids = idsResponse.data.values ?? [];
  const foundIndex = ids.findIndex((row) => String(row?.[0] ?? '').trim() === cleanId);
  if (foundIndex < 0) {
    return false;
  }

  const rowNumber = foundIndex + 2;
  await sheets.spreadsheets.values.clear({
    spreadsheetId: DASHBOARD_SHEET_ID,
    range: `trends!A${rowNumber}:Z${rowNumber}`,
  });
  return true;
};

const runHealthcheckScript = async () =>
  new Promise((resolve, reject) => {
    const child = spawn('node', [MODEL_HEALTHCHECK_SCRIPT_PATH], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('모델 헬스체크 스크립트 실행 시간이 초과되었습니다.'));
    }, 180000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`헬스체크 스크립트 종료 코드 ${code}. ${stderr.trim()}`));
        return;
      }

      const trimmed = stdout.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) {
          reject(new Error('헬스체크 스크립트 결과 형식이 올바르지 않습니다.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error(`헬스체크 결과 JSON 파싱 실패: ${trimmed.slice(0, 200)}`));
      }
    });
  });

const writeModelHealthRows = async (sheets, rows) => {
  const values = [
    ['model_id', 'status', 'latency_ms', 'checked_at', 'error_msg'],
    ...rows.map((row) => [
      String(row.modelId ?? ''),
      String(row.status ?? 'unknown'),
      row.latencyMs ?? '',
      String(row.checkedAt ?? ''),
      String(row.errorMsg ?? ''),
    ]),
  ];

  await sheets.spreadsheets.values.clear({
    spreadsheetId: DASHBOARD_SHEET_ID,
    range: 'model_health!A1:H1000',
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId: DASHBOARD_SHEET_ID,
    range: 'model_health!A1:E',
    valueInputOption: 'RAW',
    requestBody: { values },
  });
};

const getApiClients = async () => {
  if (!apiClientsPromise) {
    apiClientsPromise = (async () => {
      await ensureConfig();
      const auth = new google.auth.GoogleAuth(
        GOOGLE_AUTH_MODE === 'adc'
          ? {
              scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
            }
          : {
              keyFile: GOOGLE_SERVICE_ACCOUNT_PATH,
              scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets'],
            },
      );
      const authClient = await auth.getClient();
      return {
        drive: google.drive({ version: 'v3', auth: authClient }),
        sheets: google.sheets({ version: 'v4', auth: authClient }),
      };
    })();
  }
  return apiClientsPromise;
};

const normalizeBindingRecord = (binding) => {
  const mapped = ORCHESTRATOR_PROJECTS.find((item) => item.bindingProjectId === binding.project_id);
  return {
    projectId: binding.project_id,
    dashboardProjectId: mapped?.dashboardProjectId ?? null,
    displayName: mapped?.displayName ?? binding.project_id,
    targetType: binding.target_type ?? 'unknown',
    patchMode: binding.patch_mode ?? 'unknown',
    applyMode: binding.apply_mode ?? 'manual',
    enabled: Boolean(binding.enabled),
    primaryModelId: binding.primary_model_id ?? '',
    fallbackModelIds: binding.fallback_model_ids ?? [],
    firebaseProjectId: binding.firebase_project_id ?? null,
    firestorePatched: Boolean(binding.firestore_patched),
    notes: binding.notes ?? '',
  };
};

const providerOfModelId = (modelLookup, modelId) => {
  if (!modelId || modelId === 'none') return null;
  const record = modelLookup[modelId];
  if (record?.provider) return record.provider;
  if (modelId.startsWith('cerebras-')) return 'Cerebras';
  if (modelId.startsWith('groq-')) return 'Groq';
  if (modelId.startsWith('or-')) return 'OpenRouter';
  if (modelId.startsWith('hf-')) return 'HuggingFace';
  return null;
};

const buildProviderSummary = (status, bindings, vault) => {
  const profile =
    vault?.profiles?.find((item) => item.USER_NAME === vault.current_profile) ??
    vault?.profiles?.[0] ??
    {};
  const freeByProvider = status.free_models_by_provider ?? {};
  const modelLookup = {};

  for (const model of status.models ?? []) {
    modelLookup[model.id] = model;
  }

  const providers = {};
  for (const [name, meta] of Object.entries(ORCHESTRATOR_PROVIDER_META)) {
    providers[name] = {
      name,
      emoji: meta.emoji,
      desc: meta.desc,
      hasKey: meta.key ? Boolean(profile[meta.key]) : name === 'Ollama',
      keyName: meta.key ?? (name === 'Cloudflare' ? 'wrangler' : 'local'),
      registeredModels: [],
      freeCount: (freeByProvider[name.toLowerCase()] ?? freeByProvider[name] ?? []).length,
      primaryProjects: [],
      fallbackProjects: [],
    };
  }

  for (const model of status.models ?? []) {
    if (providers[model.provider]) {
      providers[model.provider].registeredModels.push({
        id: model.id,
        model: model.model,
        status: model.status,
        latencyMs: model.latencyMs ?? null,
      });
    }
  }

  // 제공사별 최소/평균 응답시간 계산 (live 모델만)
  for (const prov of Object.values(providers)) {
    const liveLatencies = prov.registeredModels
      .filter(m => m.status?.startsWith('✅') && m.latencyMs != null)
      .map(m => m.latencyMs);
    prov.minLatencyMs = liveLatencies.length > 0 ? Math.min(...liveLatencies) : null;
    prov.avgLatencyMs = liveLatencies.length > 0
      ? Math.round(liveLatencies.reduce((a, b) => a + b, 0) / liveLatencies.length)
      : null;
  }

  for (const binding of bindings) {
    if (!binding.enabled) continue;
    const primaryProvider = providerOfModelId(modelLookup, binding.primaryModelId);
    if (primaryProvider && providers[primaryProvider]) {
      providers[primaryProvider].primaryProjects.push(binding.displayName);
    }

    for (const fallbackModelId of binding.fallbackModelIds) {
      const fallbackProvider = providerOfModelId(modelLookup, fallbackModelId);
      if (fallbackProvider && providers[fallbackProvider] && fallbackProvider !== primaryProvider) {
        providers[fallbackProvider].fallbackProjects.push(binding.displayName);
      }
    }
  }

  return providers;
};

const loadProjectConfigs = async () => {
  const targets = ORCHESTRATOR_PROJECTS.filter((item) => item.endpoint);

  return Promise.all(
    targets.map(async (target) => {
      try {
        const response = await fetch(target.endpoint, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          return {
            projectId: target.bindingProjectId,
            dashboardProjectId: target.dashboardProjectId ?? null,
            displayName: target.displayName,
            endpoint: target.endpoint,
            ok: false,
            config: null,
            error: `HTTP ${response.status}`,
          };
        }

        const payload = await response.json();
        return {
          projectId: target.bindingProjectId,
          dashboardProjectId: target.dashboardProjectId ?? null,
          displayName: target.displayName,
          endpoint: target.endpoint,
          ok: Boolean(payload?.ok),
          config: payload?.config ?? null,
          error: payload?.ok ? undefined : '설정 조회 실패',
        };
      } catch (error) {
        return {
          projectId: target.bindingProjectId,
          dashboardProjectId: target.dashboardProjectId ?? null,
          displayName: target.displayName,
          endpoint: target.endpoint,
          ok: false,
          config: null,
          error: error instanceof Error ? error.message : '설정 조회 실패',
        };
      }
    }),
  );
};

const runOrchestratorScript = async (scriptPath, args = []) =>
  new Promise((resolve) => {
    const child = spawn('node', [scriptPath, ...args], {
      cwd: ORCHESTRATOR_DIR,
      env: { ...process.env, FORCE_COLOR: '0' },
      windowsHide: true,
    });

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, exitCode: code ?? -1, output });
    });
    child.on('error', (error) => {
      resolve({ ok: false, exitCode: -1, output: error.message });
    });
  });

app.get('/api/health', async (_, res) => {
  try {
    await ensureConfig();
    const { drive, sheets } = await getApiClients();
    const folder = await getUploadFolder(drive);
    await sheets.spreadsheets.get({
      spreadsheetId: DASHBOARD_SHEET_ID,
      fields: 'spreadsheetId,properties.title',
    });
    res.json({
      ok: true,
      configuredFolderId: DRIVE_FOLDER_ID,
      folderId: folder.folderId,
      folderName: folder.folderName,
      folderResolveMode: folder.mode,
      sheetId: DASHBOARD_SHEET_ID,
      authMode: GOOGLE_AUTH_MODE,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '환경 설정 확인에 실패했습니다.';
    const hint = isPermissionLikeError(message)
      ? 'Drive 폴더와 Spreadsheet를 서비스 계정에 편집자 권한으로 공유했는지 확인해 주세요.'
      : undefined;
    res.status(500).json({ ok: false, error: message, hint });
  }
});

app.get('/api/orchestrator/health', async (_, res) => {
  try {
    await ensureJsonFile(ORCHESTRATOR_PATHS.changelog, { changes: [] });
    const [statusExists, bindingsExists, legacyExists] = await Promise.all([
      access(ORCHESTRATOR_PATHS.status).then(() => true).catch(() => false),
      access(ORCHESTRATOR_PATHS.bindings).then(() => true).catch(() => false),
      access(ORCHESTRATOR_PATHS.legacyDashboard).then(() => true).catch(() => false),
    ]);
    const n8nOk = await fetch('http://localhost:5678/healthz', { signal: AbortSignal.timeout(5000) })
      .then((response) => response.ok)
      .catch(() => false);

    res.json({
      ok: statusExists && bindingsExists,
      files: {
        status: statusExists,
        bindings: bindingsExists,
        legacyDashboard: legacyExists,
      },
      n8nOk,
      orchestratorDir: ORCHESTRATOR_DIR,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : '오케스트레이터 상태 확인 실패',
    });
  }
});

app.get('/api/orchestrator/configs', async (_, res) => {
  const configs = await loadProjectConfigs();
  res.json({ ok: true, configs });
});

app.get('/api/orchestrator/snapshot', async (_, res) => {
  try {
    await ensureJsonFile(ORCHESTRATOR_PATHS.changelog, { changes: [] });

    const [status, rawBindings, changelog, vault, configs] = await Promise.all([
      readJsonFile(ORCHESTRATOR_PATHS.status, {}),
      readJsonFile(ORCHESTRATOR_PATHS.bindings, { bindings: [] }),
      readJsonFile(ORCHESTRATOR_PATHS.changelog, { changes: [] }),
      readJsonFile(ORCHESTRATOR_VAULT_PATH, { profiles: [] }),
      loadProjectConfigs(),
    ]);

    const bindings = (rawBindings.bindings ?? []).map(normalizeBindingRecord);
    const providers = buildProviderSummary(status, bindings, vault);
    const actuallyAutomated = bindings.filter((binding) =>
      binding.enabled && ['firestore', 'file_edit', 'n8n_api'].includes(binding.patchMode),
    );
    const summary = {
      liveModelCount: (status.live_models ?? []).length,
      deadModelCount: (status.dead_models ?? []).length,
      enabledProjectCount: bindings.filter((binding) => binding.enabled).length,
      autoProjectCount: actuallyAutomated.length,
      configSuccessCount: configs.filter((config) => config.ok).length,
      configFailureCount: configs.filter((config) => !config.ok).length,
    };

    res.json({
      ok: true,
      summary,
      status,
      bindings,
      providers,
      configs,
      changelog,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : '오케스트레이터 스냅샷 생성 실패',
    });
  }
});

app.get('/api/orchestrator/dashboard', async (_, res) => {
  try {
    const html = await readFile(ORCHESTRATOR_PATHS.legacyDashboard, 'utf8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html.replaceAll('http://localhost:7070', 'http://127.0.0.1:8787'));
  } catch (error) {
    res.status(404).json({
      ok: false,
      error: error instanceof Error ? error.message : '레거시 대시보드를 찾지 못했습니다.',
    });
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const keyword = String(req.query.keyword ?? '').trim();
    if (!keyword) {
      res.status(400).json({ ok: false, error: 'keyword가 필요합니다.' });
      return;
    }

    const n8nBase = process.env.VITE_N8N_WEBHOOK_BASE?.replace(/\/$/, '') || 'http://localhost:5678';
    const n8nUrl = `${n8nBase}/webhook/ondemand-search?keyword=${encodeURIComponent(keyword)}`;
    
    console.log('[drive-upload-api] proxying search to:', n8nUrl);
    
    const n8nRes = await fetch(n8nUrl, {
      method: 'GET',
      headers: {
        'ngrok-skip-browser-warning': 'true',
      },
      signal: AbortSignal.timeout(15000),
    });

    const body = await n8nRes.text();
    res.status(n8nRes.status).send(body);
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'n8n 연동 실패',
    });
  }
});

app.post('/api/orchestrator/fetch-models', async (_, res) => {
  const result = await runOrchestratorScript(ORCHESTRATOR_PATHS.fetchModelsScript);
  res.status(result.ok ? 200 : 500).json(result);
});

app.post('/api/orchestrator/replace-dry', async (_, res) => {
  const result = await runOrchestratorScript(ORCHESTRATOR_PATHS.replaceScript, ['--dry-run']);
  res.status(result.ok ? 200 : 500).json(result);
});

app.post('/api/orchestrator/replace-apply', async (_, res) => {
  const result = await runOrchestratorScript(ORCHESTRATOR_PATHS.replaceScript);
  res.status(result.ok ? 200 : 500).json(result);
});

app.post('/api/orchestrator/replace-project/:projectId', async (req, res) => {
  const projectId = String(req.params.projectId ?? '').trim();
  if (!projectId) {
    res.status(400).json({ ok: false, error: 'projectId가 필요합니다.' });
    return;
  }

  const result = await runOrchestratorScript(ORCHESTRATOR_PATHS.replaceScript, [`--project=${projectId}`]);
  res.status(result.ok ? 200 : 500).json(result);
});

app.post('/api/orchestrator/init-firestore', async (_, res) => {
  const result = await runOrchestratorScript(ORCHESTRATOR_PATHS.initFirestoreScript);
  res.status(result.ok ? 200 : 500).json(result);
});

app.post('/api/orchestrator/repair-autoswitch', async (_, res) => {
  const result = await runOrchestratorScript(ORCHESTRATOR_PATHS.repairAutoswitchScript);
  res.status(result.ok ? 200 : 500).json(result);
});

app.post('/api/lectures/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    const title = String(req.body.title ?? '').trim();
    const speaker = String(req.body.speaker ?? '').trim() || '작성자';
    const tags = String(req.body.tags ?? '').trim() || 'lecture';
    const summary = String(req.body.summary ?? '').trim() || '요약 미입력';

    if (!title) {
      res.status(400).json({ error: '제목을 입력해 주세요.' });
      return;
    }
    if (!file) {
      res.status(400).json({ error: '업로드 파일이 없습니다.' });
      return;
    }

    const lectureId = `lecture-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const { drive, sheets } = await getApiClients();
    const uploadFolder = await getUploadFolder(drive);

    const driveResponse = await drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [uploadFolder.folderId],
        mimeType: file.mimetype || undefined,
      },
      media: {
        mimeType: file.mimetype || 'application/octet-stream',
        body: Readable.from(file.buffer),
      },
      fields: 'id,webViewLink',
      supportsAllDrives: true,
    });

    const driveFileId = driveResponse.data.id;
    if (!driveFileId) {
      throw new Error('Drive 파일 ID를 반환받지 못했습니다.');
    }

    const driveFileUrl = driveResponse.data.webViewLink ?? `https://drive.google.com/file/d/${driveFileId}/view`;

    await appendLectureRows(sheets, [[lectureId, title, driveFileId, speaker, tags, summary, nowIso, nowIso]]);

    res.status(201).json({
      id: lectureId,
      title,
      driveFileId,
      driveFileUrl,
      uploadFolderId: uploadFolder.folderId,
      uploadFolderMode: uploadFolder.mode,
      published: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Drive 업로드 처리에 실패했습니다.';
    const isPermissionIssue = isPermissionLikeError(message);
    const isQuotaIssue = message.includes('Service Accounts do not have storage quota');
    const responseMessage = isPermissionIssue
      ? 'Drive 폴더 접근 권한이 없습니다. 서비스 계정에 폴더 편집 권한을 부여해 주세요.'
      : isQuotaIssue
        ? '서비스계정 업로드 한도에 걸렸습니다. GOOGLE_AUTH_MODE=adc 로 사용자 자격증명 모드로 전환해 주세요.'
      : message;
    console.error('[drive-upload-api] upload error:', message);
    res.status(500).json({
      error: responseMessage,
      detail: message,
      hint: isPermissionIssue
        ? 'Google Drive에서 대상 폴더를 서비스 계정에 공유하거나, 올바른 DRIVE_FOLDER_ID를 설정해 주세요.'
        : isQuotaIssue
          ? 'PowerShell에서 gcloud application-default login --scopes=https://www.googleapis.com/auth/drive,https://www.googleapis.com/auth/spreadsheets 실행 후 API를 다시 시작하세요.'
        : undefined,
    });
  }
});

app.post('/api/lectures/register-drive-file', async (req, res) => {
  try {
    const driveFileInput = String(req.body.driveFileInput ?? '').trim();
    const title = String(req.body.title ?? '').trim();
    const speaker = String(req.body.speaker ?? '').trim() || '작성자';
    const tags = String(req.body.tags ?? '').trim() || 'manual';
    const summary = String(req.body.summary ?? '').trim() || '수동 업로드 파일 등록';
    const driveFileId = extractDriveFileId(driveFileInput);

    if (!title) {
      res.status(400).json({ error: '제목을 입력해 주세요.' });
      return;
    }
    if (!driveFileId || !DRIVE_FILE_ID_PATTERN.test(driveFileId)) {
      res.status(400).json({ error: '유효한 Drive 파일 ID 또는 링크를 입력해 주세요.' });
      return;
    }

    const nowIso = new Date().toISOString();
    const lectureId = `lecture-${Date.now()}`;
    const { drive, sheets } = await getApiClients();
    const uploadFolder = await getUploadFolder(drive);
    const existingFileIds = await getExistingLectureFileIdSet(sheets);

    if (existingFileIds.has(driveFileId)) {
      res.status(200).json({
        alreadyRegistered: true,
        driveFileId,
        driveFileUrl: `https://drive.google.com/file/d/${driveFileId}/view`,
      });
      return;
    }

    const driveFile = await drive.files.get({
      fileId: driveFileId,
      fields: 'id,name,webViewLink,parents',
      supportsAllDrives: true,
    });

    const parents = driveFile.data.parents ?? [];
    if (!parents.includes(uploadFolder.folderId)) {
      res.status(400).json({
        error: '해당 파일이 Multi-trend Dashboard DB 폴더에 없습니다. 먼저 해당 폴더로 이동해 주세요.',
      });
      return;
    }

    await appendLectureRows(sheets, [[lectureId, title, driveFileId, speaker, tags, summary, nowIso, nowIso]]);

    res.status(201).json({
      id: lectureId,
      title,
      driveFileId,
      driveFileUrl: driveFile.data.webViewLink ?? `https://drive.google.com/file/d/${driveFileId}/view`,
      uploadFolderId: uploadFolder.folderId,
      uploadFolderMode: uploadFolder.mode,
      published: nowIso,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 파일 등록 처리에 실패했습니다.';
    console.error('[drive-upload-api] register-drive-file error:', message);
    res.status(500).json({
      error: 'Drive 파일 등록에 실패했습니다.',
      detail: message,
    });
  }
});

app.post('/api/lectures/sync-folder', async (_, res) => {
  try {
    const { drive, sheets } = await getApiClients();
    const uploadFolder = await getUploadFolder(drive);
    const existingFileIds = await getExistingLectureFileIdSet(sheets);
    const driveFiles = [];
    let pageToken;

    do {
      const response = await drive.files.list({
        q: `'${uploadFolder.folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
        fields: 'nextPageToken,files(id,name,webViewLink,createdTime,modifiedTime)',
        pageToken,
        pageSize: 100,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });
      driveFiles.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    const newFiles = driveFiles.filter((file) => file.id && !existingFileIds.has(file.id));
    if (!newFiles.length) {
      res.json({
        addedCount: 0,
        skippedCount: driveFiles.length,
        totalInFolder: driveFiles.length,
        uploadFolderId: uploadFolder.folderId,
        uploadFolderMode: uploadFolder.mode,
      });
      return;
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

    await appendLectureRows(sheets, rows);

    res.json({
      addedCount: newFiles.length,
      skippedCount: driveFiles.length - newFiles.length,
      totalInFolder: driveFiles.length,
      uploadFolderId: uploadFolder.folderId,
      uploadFolderMode: uploadFolder.mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Drive 폴더 동기화에 실패했습니다.';
    console.error('[drive-upload-api] sync-folder error:', message);
    res.status(500).json({
      error: 'Drive 폴더 동기화에 실패했습니다.',
      detail: message,
    });
  }
});

app.post('/api/trends/delete', async (req, res) => {
  try {
    const trendId = String(req.body?.id ?? '').trim();
    if (!trendId) {
      res.status(400).json({ error: '삭제할 보고서 ID가 필요합니다.' });
      return;
    }

    const { sheets } = await getApiClients();
    const deleted = await clearTrendRowById(sheets, trendId);
    if (!deleted) {
      res.status(404).json({ error: '해당 보고서를 찾지 못했습니다.' });
      return;
    }

    res.json({ ok: true, deletedId: trendId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'trends 삭제에 실패했습니다.';
    console.error('[drive-upload-api] trends-delete error:', message);
    res.status(500).json({
      error: 'trends 삭제에 실패했습니다.',
      detail: message,
    });
  }
});

app.post('/api/model-health/run', async (_, res) => {
  try {
    const { sheets } = await getApiClients();
    const rawRows = await runHealthcheckScript();
    await writeModelHealthRows(sheets, rawRows);

    res.json({
      ok: true,
      count: rawRows.length,
      message: '모델 헬스체크를 실행하고 model_health 시트를 갱신했습니다.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '모델 헬스체크 실행에 실패했습니다.';
    console.error('[drive-upload-api] model-health-run error:', message);
    res.status(500).json({
      ok: false,
      error: '모델 헬스체크 실행에 실패했습니다.',
      detail: message,
      hint: 'n8n 스크립트 경로(MODEL_HEALTHCHECK_SCRIPT_PATH)와 Google Sheets 권한을 확인해 주세요.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`[drive-upload-api] listening on http://127.0.0.1:${PORT}`);
});
