import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ORCHESTRATOR_DIR = path.join(ROOT, 'server', 'orchestrator');
const PUBLIC_DIR = path.join(ROOT, 'public', 'orchestrator');
const STATUS_PATH = path.join(ORCHESTRATOR_DIR, 'model_status.json');
const BINDINGS_PATH = path.join(ORCHESTRATOR_DIR, 'project_model_bindings.json');
const CHANGELOG_PATH = path.join(ORCHESTRATOR_DIR, 'change_log.json');
const VAULT_PATH = 'E:\\vault\\api_vault.json';

const PROJECTS = [
  { bindingProjectId: 'CommonAI', dashboardProjectId: 'commonai', displayName: 'CommonAI' },
  { bindingProjectId: 'career-final', dashboardProjectId: 'career-aptitude', displayName: '직업진로 탐색', endpoint: 'https://us-central1-career-aptitude-final.cloudfunctions.net/orchestratorUpdate' },
  { bindingProjectId: 'healthy-final', dashboardProjectId: 'healthy', displayName: '건강 AI 어드바이저', endpoint: 'https://us-central1-healthy-final.cloudfunctions.net/orchestratorUpdate' },
  { bindingProjectId: 'mbti-final', dashboardProjectId: 'mbti', displayName: 'MBTI AI 성격 분석', endpoint: 'https://us-central1-mbti-final.cloudfunctions.net/orchestratorUpdate' },
  { bindingProjectId: 'tarot-final', dashboardProjectId: 'tarot', displayName: '타로 카드 AI 리딩', endpoint: 'https://us-central1-tarot-final-1b241.cloudfunctions.net/orchestratorUpdate' },
  { bindingProjectId: 'values-test-final', dashboardProjectId: 'values', displayName: '가치관 테스트', endpoint: 'https://us-central1-values-test-final.cloudfunctions.net/orchestratorUpdate' },
  { bindingProjectId: 'core-competencies-final', dashboardProjectId: 'core-competencies', displayName: '핵심역량 진단', endpoint: 'https://us-central1-core-competencies-finai.cloudfunctions.net/orchestratorUpdate' },
  { bindingProjectId: 'multiple-intelligence-final', dashboardProjectId: 'multiple-intelligence', displayName: '다중지능 검사', endpoint: 'https://us-central1-multiple-intelligence-final.cloudfunctions.net/orchestratorUpdate' },
  { bindingProjectId: 'saju-kang', dashboardProjectId: 'saju', displayName: '사주팔자 AI 분석' },
  { bindingProjectId: 'Lotto-generation', dashboardProjectId: 'lotto', displayName: '로또 번호 생성기' },
  { bindingProjectId: 'Pension-lottery', dashboardProjectId: 'pension', displayName: '연금복권 분석기' },
  { bindingProjectId: 'kquant', dashboardProjectId: 'kquant', displayName: 'KQuant 주식 분석' },
  { bindingProjectId: 'multi-trend-dashboard-n8n', dashboardProjectId: 'multi-trend', displayName: 'Multi-trend n8n' },
  { bindingProjectId: 'cloudflare-multi-trend-dashboard', dashboardProjectId: 'multi-trend', displayName: 'Multi-trend Dashboard' },
  { bindingProjectId: 'cloudflare-korea-law', dashboardProjectId: 'korean-law', displayName: '대한민국 법령 가이드' },
];

const PROVIDER_META = {
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

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
};

const normalizeBinding = (binding) => {
  const mapped = PROJECTS.find((project) => project.bindingProjectId === binding.project_id);
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

const providerOfModelId = (lookup, modelId) => {
  if (!modelId || modelId === 'none') return null;
  if (lookup[modelId]?.provider) return lookup[modelId].provider;
  if (modelId.startsWith('cerebras-')) return 'Cerebras';
  if (modelId.startsWith('groq-')) return 'Groq';
  if (modelId.startsWith('or-')) return 'OpenRouter';
  if (modelId.startsWith('hf-')) return 'HuggingFace';
  return null;
};

const buildProviders = (status, bindings, vault) => {
  const profile =
    vault?.profiles?.find((item) => item.USER_NAME === vault.current_profile) ??
    vault?.profiles?.[0] ??
    {};
  const freeByProvider = status.free_models_by_provider ?? {};
  const modelLookup = Object.fromEntries((status.models ?? []).map((model) => [model.id, model]));
  const providers = {};

  for (const [name, meta] of Object.entries(PROVIDER_META)) {
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
      });
    }
  }

  for (const binding of bindings) {
    if (!binding.enabled) continue;
    const primaryProvider = providerOfModelId(modelLookup, binding.primaryModelId);
    if (primaryProvider && providers[primaryProvider]) {
      providers[primaryProvider].primaryProjects.push(binding.displayName);
    }
    for (const fallbackId of binding.fallbackModelIds) {
      const fallbackProvider = providerOfModelId(modelLookup, fallbackId);
      if (fallbackProvider && providers[fallbackProvider] && fallbackProvider !== primaryProvider) {
        providers[fallbackProvider].fallbackProjects.push(binding.displayName);
      }
    }
  }

  return providers;
};

const loadConfigs = async () =>
  Promise.all(
    PROJECTS.filter((project) => project.endpoint).map(async (project) => {
      try {
        const response = await fetch(project.endpoint, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          return {
            projectId: project.bindingProjectId,
            dashboardProjectId: project.dashboardProjectId ?? null,
            displayName: project.displayName,
            endpoint: project.endpoint,
            ok: false,
            config: null,
            error: `HTTP ${response.status}`,
          };
        }
        const payload = await response.json();
        return {
          projectId: project.bindingProjectId,
          dashboardProjectId: project.dashboardProjectId ?? null,
          displayName: project.displayName,
          endpoint: project.endpoint,
          ok: Boolean(payload?.ok),
          config: payload?.config ?? null,
          error: payload?.ok ? undefined : '설정 조회 실패',
        };
      } catch (error) {
        return {
          projectId: project.bindingProjectId,
          dashboardProjectId: project.dashboardProjectId ?? null,
          displayName: project.displayName,
          endpoint: project.endpoint,
          ok: false,
          config: null,
          error: error instanceof Error ? error.message : '설정 조회 실패',
        };
      }
    }),
  );

const main = async () => {
  await fs.mkdir(PUBLIC_DIR, { recursive: true });

  const [status, rawBindings, changelog, vault, configs] = await Promise.all([
    readJson(STATUS_PATH, {}),
    readJson(BINDINGS_PATH, { bindings: [] }),
    readJson(CHANGELOG_PATH, { changes: [] }),
    readJson(VAULT_PATH, { profiles: [] }),
    loadConfigs(),
  ]);

  const bindings = (rawBindings.bindings ?? []).map(normalizeBinding);
  const providers = buildProviders(status, bindings, vault);
  const summary = {
    liveModelCount: (status.live_models ?? []).length,
    deadModelCount: (status.dead_models ?? []).length,
    enabledProjectCount: bindings.filter((binding) => binding.enabled).length,
    autoProjectCount: bindings.filter((binding) => binding.enabled && ['firestore', 'file_edit', 'n8n_api'].includes(binding.patchMode)).length,
    configSuccessCount: configs.filter((config) => config.ok).length,
    configFailureCount: configs.filter((config) => !config.ok).length,
  };

  const snapshot = {
    ok: true,
    summary,
    status,
    bindings,
    providers,
    configs,
    changelog,
  };

  await Promise.all([
    fs.copyFile(STATUS_PATH, path.join(PUBLIC_DIR, 'model_status.json')),
    fs.copyFile(BINDINGS_PATH, path.join(PUBLIC_DIR, 'project_model_bindings.json')),
    fs.copyFile(CHANGELOG_PATH, path.join(PUBLIC_DIR, 'change_log.json')),
    fs.writeFile(path.join(PUBLIC_DIR, 'snapshot.json'), JSON.stringify(snapshot, null, 2), 'utf8'),
  ]);

  console.log('[sync-orchestrator-assets] snapshot.json 생성 완료');
};

main().catch((error) => {
  console.error('[sync-orchestrator-assets] 실패:', error);
  process.exit(1);
});
