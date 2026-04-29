// 전체 프로젝트에서 사용 중인 무료/무료티어 AI 모델 중앙 등록소
// 오케스트레이터는 죽은 모델을 제외하고, 무료이면서 상대적으로 성능이 좋은 모델만 우선 노출한다.

export interface ModelEntry {
  id: string;
  displayName: string;
  apiModel: string;
  provider: 'groq' | 'cerebras' | 'openrouter';
  baseUrl: string;
  usedIn: string[];
  role: 'primary' | 'fallback';
  fallbackId?: string;
  projectRoles?: Record<string, 'primary' | 'fallback'>;
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    id: 'groq-llama33-70b',
    displayName: 'llama-3.3-70b (Groq)',
    apiModel: 'llama-3.3-70b-versatile',
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    usedIn: ['saju', 'commonai'],
    role: 'primary',
    fallbackId: 'groq-llama31-8b',
  },
  {
    id: 'groq-llama31-8b',
    displayName: 'llama-3.1-8b (Groq)',
    apiModel: 'llama-3.1-8b-instant',
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    usedIn: ['saju', 'commonai'],
    role: 'fallback',
    fallbackId: 'or-gemini-flash-lite',
  },
  {
    id: 'cerebras-llama33-70b',
    displayName: 'llama-3.3-70b (Cerebras)',
    apiModel: 'llama-3.3-70b',
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    usedIn: ['tarot', 'mbti', 'healthy', 'values', 'core-competencies', 'career-aptitude', 'multiple-intelligence'],
    role: 'primary',
    fallbackId: 'cerebras-llama31-8b',
  },
  {
    id: 'cerebras-llama31-8b',
    displayName: 'llama3.1-8b (Cerebras)',
    apiModel: 'llama3.1-8b',
    provider: 'cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    usedIn: ['tarot', 'mbti', 'healthy', 'values', 'core-competencies', 'career-aptitude', 'multiple-intelligence'],
    role: 'fallback',
    fallbackId: 'or-gemini-flash-lite',
  },
  {
    id: 'or-step-flash',
    displayName: 'step-3.5-flash (OpenRouter)',
    apiModel: 'stepfun/step-3.5-flash',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    usedIn: ['lotto', 'pension', 'multi-trend'],
    role: 'primary',
    fallbackId: 'or-gemini-flash-lite',
    projectRoles: {
      'lotto': 'primary',
      'pension': 'primary',
      'multi-trend': 'fallback',
    },
  },
  {
    id: 'or-gemini-flash-lite',
    displayName: 'gemini-flash-lite (OpenRouter)',
    apiModel: 'google/gemini-2.0-flash-lite-001',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    usedIn: ['saju', 'multiple-intelligence', 'lotto', 'pension', 'korean-law', 'kquant', 'multi-trend', 'commonai'],
    role: 'fallback',
    fallbackId: 'or-gpt-oss-free',
    projectRoles: {
      'korean-law': 'primary',
      'kquant': 'primary',
      'multi-trend': 'primary',
    },
  },
  {
    id: 'or-gpt-oss-free',
    displayName: 'gpt-oss-120b free (OpenRouter)',
    apiModel: 'openai/gpt-oss-120b:free',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    usedIn: [
      'tarot',
      'mbti',
      'healthy',
      'values',
      'core-competencies',
      'career-aptitude',
      'saju',
      'multiple-intelligence',
      'korean-law',
      'kquant',
      'lotto',
      'pension',
      'multi-trend',
      'commonai',
    ],
    role: 'fallback',
    fallbackId: 'or-step-flash',
  },
  {
    id: 'or-qwen3-coder-free',
    displayName: 'qwen3-coder free (OpenRouter)',
    apiModel: 'qwen/qwen3-coder:free',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    usedIn: [
      'tarot',
      'mbti',
      'healthy',
      'values',
      'core-competencies',
      'career-aptitude',
      'saju',
      'multiple-intelligence',
      'korean-law',
      'kquant',
      'lotto',
      'pension',
      'commonai',
    ],
    role: 'fallback',
  },
];

export const getModelsForProject = (projectId: string): ModelEntry[] =>
  MODEL_REGISTRY.filter((model) => model.usedIn.includes(projectId));

export const getRecommendedModel = (
  modelId: string,
  healthMap: Map<string, { status: string }>,
  depth = 0,
): ModelEntry | null => {
  if (depth > 5) return null;
  const entry = MODEL_REGISTRY.find((model) => model.id === modelId);
  if (!entry) return null;
  const health = healthMap.get(modelId);
  if (!health || health.status === 'ok') return entry;
  if (entry.fallbackId) return getRecommendedModel(entry.fallbackId, healthMap, depth + 1);
  return null;
};
