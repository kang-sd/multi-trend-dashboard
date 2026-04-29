import { useState, useEffect } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { PROJECTS } from '../../data/projects';
import { getModelsForProject, getRecommendedModel } from '../../data/modelRegistry';
import { loadOrchestratorSnapshot, triggerModelHealthcheck } from '../../services/dashboardData';
import type { ModelHealthRecord, OrchestratorBindingRecord, OrchestratorSnapshot } from '../../types/dashboard';

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green',
  dev: 'badge-amber',
  plan: 'badge-gray',
};
const STATUS_LABEL: Record<string, string> = {
  active: '운영 중',
  dev: '개발 중',
  plan: '계획',
};

const HEALTH_DOT: Record<string, string> = {
  ok: '🟢',
  error: '🔴',
  unknown: '🟡',
};

const CATEGORIES = ['전체', ...Array.from(new Set(PROJECTS.map((p) => p.category)))];

const deriveHealthMap = (snapshotData: OrchestratorSnapshot | null) => {
  const map = new Map<string, ModelHealthRecord>();
  const checkedAt = snapshotData?.status?._meta?.last_checked ?? '';

  for (const model of snapshotData?.status?.models ?? []) {
    const normalizedStatus =
      typeof model.status === 'string' && model.status.startsWith('✅')
        ? 'ok'
        : typeof model.status === 'string' && model.status.startsWith('❌')
          ? 'error'
          : 'unknown';

    map.set(model.id, {
      modelId: model.id,
      status: normalizedStatus,
      latencyMs: null,
      checkedAt,
      errorMsg: normalizedStatus === 'error' ? model.status : '',
    });
  }

  return map;
};

const getAutomationMeta = (binding?: OrchestratorBindingRecord | null) => {
  if (!binding) {
    return {
      label: '오케스트레이터 미연결',
      tone: 'gray' as const,
      reason: '아직 중앙 오케스트레이터 바인딩이 없습니다.',
    };
  }

  if (!binding.enabled) {
    return {
      label: '비활성',
      tone: 'gray' as const,
      reason: binding.notes || '레거시 또는 운영 제외 대상으로 비활성화되었습니다.',
    };
  }

  if (binding.patchMode === 'manual_log') {
    return {
      label: '수동 반영',
      tone: 'amber' as const,
      reason: binding.notes || '자동 패치 API가 없어 변경 제안만 기록합니다.',
    };
  }

  if (['firestore', 'file_edit', 'n8n_api'].includes(binding.patchMode)) {
    return {
      label: '자동 반영',
      tone: 'green' as const,
      reason: binding.notes || `${binding.patchMode} 경로로 자동 동기화됩니다.`,
    };
  }

  return {
    label: '보류',
    tone: 'gray' as const,
    reason: binding.notes || '현재 자동화 경로가 확정되지 않았습니다.',
  };
};

const getAutomationBadgeClass = (tone: 'green' | 'amber' | 'gray') =>
  tone === 'green' ? 'badge-green' : tone === 'amber' ? 'badge-amber' : 'badge-gray';

export default function ProjectsTab() {
  const [cat, setCat] = useState('전체');
  const [healthMap, setHealthMap] = useState<Map<string, ModelHealthRecord>>(new Map());
  const [bindingMap, setBindingMap] = useState<Map<string, OrchestratorBindingRecord>>(new Map());
  const [isRunningHealthcheck, setIsRunningHealthcheck] = useState(false);
  const [healthcheckMessage, setHealthcheckMessage] = useState('');

  const refreshHealthMap = async () => {
    const snapshot = await loadOrchestratorSnapshot();
    setHealthMap(deriveHealthMap(snapshot));
    setBindingMap(
      new Map(
        (snapshot?.bindings ?? [])
          .filter((binding) => binding.dashboardProjectId)
          .map((binding) => [binding.dashboardProjectId as string, binding]),
      ),
    );
  };

  useEffect(() => {
    void refreshHealthMap();
  }, []);

  const handleRunHealthcheck = async () => {
    if (isRunningHealthcheck) return;

    setIsRunningHealthcheck(true);
    setHealthcheckMessage('헬스체크 워크플로우 실행 요청 중...');

    const runResult = await triggerModelHealthcheck();
    if (!runResult.success) {
      setHealthcheckMessage(runResult.message);
      setIsRunningHealthcheck(false);
      return;
    }

    setHealthcheckMessage('실행 요청 완료. 최신 상태를 불러오는 중...');
    await new Promise((resolve) => setTimeout(resolve, 2200));
    await refreshHealthMap();
    setHealthcheckMessage('헬스 상태를 갱신했습니다.');
    setIsRunningHealthcheck(false);
  };

  const filtered = cat === '전체' ? PROJECTS : PROJECTS.filter((p) => p.category === cat);

  return (
    <div className="section">
      <div className="section-header-row">
        <div>
          <p className="section-eyebrow">MY PROJECTS</p>
          <h2 className="section-title">프로젝트</h2>
          <p className="section-desc">직접 기획·개발·운영하는 AI 기반 프로젝트들</p>
        </div>
        <div className="section-header-actions">
          <button
            className="btn-action gray"
            onClick={() => void handleRunHealthcheck()}
            disabled={isRunningHealthcheck}
          >
            <RefreshCw size={14} className={isRunningHealthcheck ? 'spin' : ''} />
            {isRunningHealthcheck ? '헬스체크 실행 중' : '모델 헬스체크 수동 실행'}
          </button>
          {healthcheckMessage && (
            <p className={`section-note ${healthcheckMessage.includes('실패') || healthcheckMessage.includes('연결할 수 없습니다') ? 'error' : ''}`}>
              {healthcheckMessage}
            </p>
          )}
        </div>
      </div>

      <div className="tag-filter">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            className={`tag-chip${cat === c ? ' active' : ''}`}
            onClick={() => setCat(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid-2 fade-in">
        {filtered.map((p) => {
          const registryModels = getModelsForProject(p.id);
          const binding = bindingMap.get(p.id);
          const automationMeta = getAutomationMeta(binding);
          return (
            <div key={p.id} className="project-card">
              <div className="project-card-header">
                <div>
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-cat">{p.category}</div>
                </div>
                <div className="project-card-actions">
                  <span className={`badge ${STATUS_BADGE[p.status] ?? 'badge-gray'}`}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <span className={`badge ${getAutomationBadgeClass(automationMeta.tone)}`}>
                    {automationMeta.label}
                  </span>
                  {p.url && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-action sm"
                    >
                      <ExternalLink size={11} />
                      방문
                    </a>
                  )}
                </div>
              </div>

              <p className="project-card-desc">{p.desc}</p>
              <div className="flow-box" style={{ marginTop: '0.5rem', fontSize: '0.74rem' }}>
                오케스트레이터 상태: {automationMeta.reason}
              </div>

              {p.tools.length > 0 && (
                <div className="tool-tags">
                  {p.tools.map((t) => (
                    <span key={t} className="tool-tag">{t}</span>
                  ))}
                </div>
              )}

              {registryModels.length > 0 ? (
                <div className="tool-tags">
                  {registryModels.map((m) => {
                    const health = healthMap.get(m.id);
                    const dot = health ? (HEALTH_DOT[health.status] ?? '⚪') : '⚪';
                    const isDead = health?.status === 'error';
                    const recommended = isDead ? getRecommendedModel(m.id, healthMap) : null;
                    const tooltip = health
                      ? `${health.status === 'ok' ? '정상' : health.status === 'error' ? '오류' : '알 수 없음'} | 지연: ${health.latencyMs ?? '-'}ms | ${health.checkedAt?.slice(0, 10) ?? '-'}${health.errorMsg ? ' | ' + health.errorMsg : ''}`
                      : '헬스체크 미실행';
                    const effectiveRole = m.projectRoles?.[p.id] ?? m.role;
                    return (
                      <span key={m.id} className="ai-tag" title={tooltip}>
                        {dot} {m.displayName}
                        {health?.latencyMs != null && (
                          <span className="ai-tag-latency"> {health.latencyMs}ms</span>
                        )}
                        {effectiveRole === 'fallback' && !isDead && (
                          <span className="ai-tag-role">(폴백)</span>
                        )}
                        {isDead && recommended && recommended.id !== m.id && (
                          <span className="ai-tag-role"> → {recommended.displayName}</span>
                        )}
                      </span>
                    );
                  })}
                </div>
              ) : p.aiModels.length > 0 ? (
                <div className="tool-tags">
                  {p.aiModels.map((m) => (
                    <span key={m} className="ai-tag">{m}</span>
                  ))}
                </div>
              ) : null}

              {p.flow && <div className="flow-box">{p.flow}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
