import type { LucideIcon } from 'lucide-react';

export interface ModelHealthRecord {
  modelId: string;       // MODEL_REGISTRY의 id와 매칭
  status: 'ok' | 'error' | 'unknown';
  latencyMs: number | null;
  checkedAt: string;     // ISO 날짜
  errorMsg: string;
}

export type DashboardTabId = 'home' | 'radar' | 'youtube' | 'lectures' | 'projects';
export type TabId = 'services' | 'trends' | 'lectures' | 'youtube' | 'projects' | 'orchestrator';

export interface OrchestratorConfig {
  cerebras_model: string;
  or_model: string;
  or_model_2: string;
  hf_model?: string;
  updated_at: string;
  updated_by: string;
}

export interface OrchestratorProviderModel {
  id: string;
  model: string;
  status: string;
  latencyMs?: number | null;
}

export interface OrchestratorProviderSummary {
  name: string;
  emoji: string;
  desc: string;
  hasKey: boolean;
  keyName: string;
  registeredModels: OrchestratorProviderModel[];
  freeCount: number;
  primaryProjects: string[];
  fallbackProjects: string[];
  minLatencyMs?: number | null;
  avgLatencyMs?: number | null;
}

export interface OrchestratorBindingRecord {
  projectId: string;
  dashboardProjectId: string | null;
  displayName: string;
  targetType: string;
  patchMode: string;
  applyMode: string;
  enabled: boolean;
  primaryModelId: string;
  fallbackModelIds: string[];
  firebaseProjectId: string | null;
  firestorePatched: boolean;
  notes: string;
}

export interface OrchestratorProjectConfigRecord {
  projectId: string;
  dashboardProjectId: string | null;
  displayName: string;
  endpoint: string;
  ok: boolean;
  config: OrchestratorConfig | null;
  error?: string;
}

export interface OrchestratorSnapshot {
  ok: boolean;
  summary: {
    liveModelCount: number;
    deadModelCount: number;
    enabledProjectCount: number;
    autoProjectCount: number;
    configSuccessCount: number;
    configFailureCount: number;
  };
  status: {
    _meta?: {
      last_checked?: string;
      free_models_updated?: string;
    };
    models?: Array<{
      id: string;
      provider: string;
      model: string;
      status: string;
      priority: number;
    }>;
    live_models?: string[];
    dead_models?: string[];
  };
  bindings: OrchestratorBindingRecord[];
  providers: Record<string, OrchestratorProviderSummary>;
  configs: OrchestratorProjectConfigRecord[];
  changelog: { changes: unknown[] };
}

export interface NavItem {
  id: DashboardTabId;
  name: string;
  icon: LucideIcon;
}

export interface AppRecord {
  id: string;
  name: string;
  url: string;
  category: string;
  summary: string;
  image: string;
  status: string;
  updatedAt: string;
}

export interface TrendRecord {
  id: string;
  source: string;
  title: string;
  link: string;
  summary: string;
  score: number | null;
  date: string;
  image: string;
  keyFacts: string;
  whyImportant: string;
  industryImpact: string;
  actionPoint: string;
  causalAnalysis: string;
  secondOrderEffect: string;
  forecast3m: string;
  forecast12m: string;
  scenarioBase: string;
  scenarioBull: string;
  scenarioBear: string;
  probabilityBase: number | null;
  probabilityBull: number | null;
  probabilityBear: number | null;
  confidence: string;
  evidenceQuality: string;
  glossaryTerms: string;
  footnotes: string;
}

export interface LectureRecord {
  id: string;
  title: string;
  driveFileId: string;
  speaker: string;
  tags: string;
  summary: string;
  published: string;
  updatedAt: string;
  link: string;
}

export interface DashboardDataSnapshot {
  trends: TrendRecord[];
  lectures: LectureRecord[];
  warnings: string[];
  lastSyncAt: string;
}

export interface ProjectRecord {
  id: string;
  name: string;
  url: string;
  category: string;
  desc: string;
  tools: string[];
  aiModels: string[];
  flow: string;
  status: 'active' | 'dev' | 'plan';
}

export interface YoutubeVideo {
  videoId: string;
  channelName: string;
  channelHandle: string;
  channelId: string;
  title: string;
  published: string;
  thumbnailUrl: string;
  videoUrl: string;
  color: string;
  topicCluster: string;
  contentType: string;
  oneLineSummary: string;
  strategicAngle: string;
  relatedTrendId: string;
  relatedProjectId: string;
  relatedLectureId: string;
  isFeatured: boolean;
  language: string;
  durationBucket: string;
  collectedAt: string;
}
