import { useEffect, useState } from 'react';
import { RefreshCw, Settings, Shield, Zap, X, ChevronRight } from 'lucide-react';
import { MODEL_REGISTRY, getModelsForProject } from '../../data/modelRegistry';
import { PROJECTS } from '../../data/projects';
import { loadOrchestratorSnapshot, triggerModelHealthcheck } from '../../services/dashboardData';
import type { ModelHealthRecord, OrchestratorBindingRecord, OrchestratorSnapshot, OrchestratorProviderSummary } from '../../types/dashboard';

const HEALTH_DOT: Record<string, string> = { ok: '🟢', error: '🔴', unknown: '🟡' };
const HEALTH_LABEL: Record<string, string> = { ok: '정상', error: '장애', unknown: '미확인' };

const findProjectMeta = (binding: OrchestratorBindingRecord) =>
  binding.dashboardProjectId ? PROJECTS.find((project) => project.id === binding.dashboardProjectId) : null;

const renderModelTags = (binding: OrchestratorBindingRecord, healthMap: Map<string, ModelHealthRecord>) => {
  const linkedModels = binding.dashboardProjectId ? getModelsForProject(binding.dashboardProjectId) : [];

  if (linkedModels.length > 0) {
    return linkedModels.map((model) => {
      const health = healthMap.get(model.id);
      const dot = health ? (HEALTH_DOT[health.status] ?? '⚪') : '⚪';
      const effectiveRole = binding.dashboardProjectId ? (model.projectRoles?.[binding.dashboardProjectId] ?? model.role) : model.role;
      return (
        <span
          key={model.id}
          className="ai-tag"
          title={health ? `${HEALTH_LABEL[health.status]} · ${health.latencyMs ?? '-'}ms` : '미확인'}
        >
          {dot} {model.displayName}
          {effectiveRole === 'fallback' && <span className="ai-tag-role"> (폴백)</span>}
        </span>
      );
    });
  }

  return [binding.primaryModelId, ...binding.fallbackModelIds]
    .filter(Boolean)
    .map((modelId) => (
      <span key={`${binding.projectId}-${modelId}`} className="ai-tag">
        ⚪ {modelId}
      </span>
    ));
};

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

const getBindingStatusMeta = (binding: OrchestratorBindingRecord) => {
  if (!binding.enabled) {
    return {
      label: '비활성',
      tone: 'gray',
      reason: binding.notes || '레거시 또는 운영 제외 대상으로 꺼져 있습니다.',
    };
  }

  if (binding.patchMode === 'manual_log') {
    return {
      label: '수동 반영',
      tone: 'amber',
      reason: binding.notes || '자동 패치가 불가능해 변경 제안만 기록합니다.',
    };
  }

  if (binding.patchMode === 'file_edit') {
    return {
      label: '자동 반영',
      tone: 'green',
      reason: binding.notes || '파일 직접 수정 경로로 자동 반영됩니다.',
    };
  }

  if (binding.patchMode === 'firestore') {
    return {
      label: '자동 반영',
      tone: 'green',
      reason: binding.notes || 'Firestore 설정 문서를 자동 동기화합니다.',
    };
  }

  if (binding.patchMode === 'n8n_api') {
    return {
      label: '자동 반영',
      tone: 'green',
      reason: binding.notes || 'n8n API 경로로 자동 동기화합니다.',
    };
  }

  return {
    label: '보류',
    tone: 'gray',
    reason: binding.notes || '현재 운영 모드가 확정되지 않았습니다.',
  };
};

const getBadgeStyle = (tone: string) =>
  tone === 'green'
    ? { background: '#16351f', color: '#22c55e', border: '1px solid #22c55e33' }
    : tone === 'amber'
      ? { background: '#3c2f14', color: '#f59e0b', border: '1px solid #f59e0b33' }
      : { background: 'var(--card-bg)', color: 'var(--muted)', border: '1px solid var(--border)' };

// ── AI 상세보기 모달 ─────────────────────────────────────────
function AiDetailModal({ snapshot, onClose }: {
  snapshot: OrchestratorSnapshot | null;
  onClose: () => void;
}) {
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({});
  const providers = Object.values(snapshot?.providers ?? {}) as OrchestratorProviderSummary[];
  const allModels = snapshot?.status?.models ?? [];
  // 제공사별 무료 모델 목록 (free_models_by_provider)
  const freeModelsByProvider = (snapshot?.status as Record<string, unknown> | null)
    ?.free_models_by_provider as Record<string, { id: string; name: string; context_length?: number }[]> | undefined ?? {};
  const freeProviderKeys = Object.keys(freeModelsByProvider).filter(k => (freeModelsByProvider[k] ?? []).length > 0);
  const totalFreeModels = freeProviderKeys.reduce((sum, k) => sum + (freeModelsByProvider[k] ?? []).length, 0);

  const toggleProvider = (key: string) =>
    setExpandedProviders(prev => ({ ...prev, [key]: !prev[key] }));

  const statusStyle = (s: string) => ({
    color: s.startsWith('✅') ? '#22c55e' : s.startsWith('❌') ? '#ef4444' : '#f59e0b',
    fontSize: '11px',
  });

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      overflowY: 'auto', padding: '2rem 1rem',
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: '#0f1117', border: '1px solid #2e3250',
        boxShadow: '0 24px 64px rgba(0,0,0,0.9)',
        borderRadius: '1rem', width: '100%', maxWidth: '960px',
        padding: '2rem',
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', letterSpacing: '0.1em' }}>AI MODEL DETAIL</div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>AI 제공사 상세 현황</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.4rem', cursor: 'pointer', color: 'var(--muted)' }}>
            <X size={16} />
          </button>
        </div>

        {/* 요약 배지 */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <span style={{ background: '#16351f', color: '#22c55e', border: '1px solid #22c55e33', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600 }}>
            ✅ Live {(snapshot?.status?.live_models ?? []).length}개
          </span>
          <span style={{ background: '#3a1a1a', color: '#ef4444', border: '1px solid #ef444433', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.8rem', fontWeight: 600 }}>
            ❌ Dead {(snapshot?.status?.dead_models ?? []).length}개
          </span>
          <span style={{ background: 'var(--card-bg)', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '0.4rem', padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
            전체 {allModels.length}개 등록
          </span>
        </div>

        {/* 제공사별 카드 그리드 */}
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)', marginBottom: '0.75rem', letterSpacing: '0.05em' }}>제공사별 모델 현황</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '2rem' }}>
          {providers.map((prov) => {
            const liveCount = prov.registeredModels.filter(m => m.status?.startsWith('✅')).length;
            const deadCount = prov.registeredModels.filter(m => m.status?.startsWith('❌')).length;
            return (
              <div key={prov.name} style={{
                background: '#1c2033', border: `1px solid ${deadCount > 0 ? '#7f1d1d' : '#2e3250'}`,
                borderRadius: '0.75rem', padding: '1rem',
              }}>
                {/* 카드 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f1f5f9' }}>{prov.emoji} {prov.name}</div>
                  <span style={{ fontSize: '10px', color: prov.hasKey ? '#4ade80' : '#fbbf24', background: prov.hasKey ? '#052e16' : '#451a03', padding: '2px 6px', borderRadius: '4px' }}>{prov.hasKey ? '🔑 키 있음' : '키 없음'}</span>
                </div>
                <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '0.5rem' }}>{prov.desc}</div>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '0.6rem' }}>
                  등록 {prov.registeredModels.length}개 · 무료 {prov.freeCount}개
                  {liveCount > 0 && <span style={{ color: '#4ade80', marginLeft: '6px', fontWeight: 600 }}>✅ {liveCount}</span>}
                  {deadCount > 0 && <span style={{ color: '#f87171', marginLeft: '4px', fontWeight: 600 }}>❌ {deadCount}</span>}
                  {prov.minLatencyMs != null && (
                    <span style={{ color: '#60a5fa', marginLeft: '6px' }}>⚡ {prov.minLatencyMs}ms</span>
                  )}
                </div>

                {/* 등록 모델 목록 */}
                {prov.registeredModels.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {prov.registeredModels.map((m) => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', borderBottom: '1px solid #ffffff0d' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0, background: m.status?.startsWith('✅') ? '#22c55e' : m.status?.startsWith('❌') ? '#ef4444' : '#f59e0b' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.model}>{m.model ?? m.id}</div>
                          <div style={{ fontSize: '9px', color: '#475569' }}>{m.id}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <span style={statusStyle(m.status ?? '')}>
                            {m.status?.startsWith('✅') ? '✅' : m.status?.startsWith('❌') ? '❌' : '⚠️'}
                          </span>
                          {m.latencyMs != null && (
                            <span style={{ fontSize: '9px', color: '#60a5fa' }}>{m.latencyMs}ms</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '11px', color: 'var(--muted)', opacity: 0.5 }}>등록 모델 없음</div>
                )}

                {/* 사용 프로젝트 */}
                {(prov.primaryProjects.length > 0 || prov.fallbackProjects.length > 0) && (
                  <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.5rem' }}>
                    {prov.primaryProjects.length > 0 && (
                      <div style={{ fontSize: '9px', color: '#22c55e', marginBottom: '2px' }}>
                        🔴 Primary: {prov.primaryProjects.slice(0, 3).join(', ')}{prov.primaryProjects.length > 3 ? ` +${prov.primaryProjects.length - 3}` : ''}
                      </div>
                    )}
                    {prov.fallbackProjects.length > 0 && (
                      <div style={{ fontSize: '9px', color: 'var(--muted)' }}>
                        🟡 Fallback: {prov.fallbackProjects.slice(0, 3).join(', ')}{prov.fallbackProjects.length > 3 ? ` +${prov.fallbackProjects.length - 3}` : ''}
                      </div>
                    )}
                  </div>
                )}
                {prov.primaryProjects.length === 0 && prov.fallbackProjects.length === 0 && (
                  <div style={{ marginTop: '0.4rem', fontSize: '9px', color: 'var(--muted)', opacity: 0.5 }}>사용 프로젝트 없음</div>
                )}
              </div>
            );
          })}
        </div>

        {/* 전체 모델 헬스 테이블 */}
        <div style={{ borderTop: '1px solid #2e3250', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.75rem', letterSpacing: '0.08em' }}>전체 등록 모델 ({allModels.length}개)</div>
          <div style={{ overflowX: 'auto', borderRadius: '0.5rem', border: '1px solid #2e3250' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#1c2033', borderBottom: '1px solid #2e3250', color: '#94a3b8', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>ID (alias)</th>
                  <th style={{ padding: '6px 8px' }}>제공사</th>
                  <th style={{ padding: '6px 8px' }}>실제 모델명</th>
                  <th style={{ padding: '6px 8px' }}>상태</th>
                </tr>
              </thead>
              <tbody>
                {allModels.map((m, i) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #1e2340', background: i % 2 === 0 ? '#161929' : '#1c2033' }}>
                    <td style={{ padding: '6px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: '11px' }}>{m.id}</td>
                    <td style={{ padding: '6px 12px', color: '#94a3b8' }}>{m.provider}</td>
                    <td style={{ padding: '6px 12px', fontWeight: 600, color: '#e2e8f0' }}>{m.model}</td>
                    <td style={{ padding: '6px 12px' }}>
                      <span style={{ color: m.status?.startsWith('✅') ? '#4ade80' : m.status?.startsWith('❌') ? '#f87171' : '#fbbf24', fontSize: '11px', fontWeight: 600 }}>
                        {m.status?.startsWith('✅') ? '✅ live' : m.status?.startsWith('❌') ? '❌ dead' : '⚠️ warn'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 무료 모델 전체 목록 섹션 */}
        {totalFreeModels > 0 && (
          <div style={{ borderTop: '1px solid #2e3250', paddingTop: '1.25rem', marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em' }}>
                무료 모델 전체 목록
              </div>
              <span style={{ background: '#16351f', color: '#4ade80', border: '1px solid #22c55e33', borderRadius: '0.3rem', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>
                총 {totalFreeModels}개
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {freeProviderKeys.map(provKey => {
                const models = freeModelsByProvider[provKey] ?? [];
                const isOpen = expandedProviders[provKey] ?? false;
                const provLabel = provKey.charAt(0).toUpperCase() + provKey.slice(1);
                return (
                  <div key={provKey} style={{ background: '#161929', border: '1px solid #2e3250', borderRadius: '0.5rem', overflow: 'hidden' }}>
                    <button
                      onClick={() => toggleProvider(provKey)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.6rem 1rem', background: 'none', border: 'none', cursor: 'pointer',
                        color: '#e2e8f0', textAlign: 'left',
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>
                        {isOpen ? '▾' : '▸'} {provLabel}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{models.length}개</span>
                    </button>
                    {isOpen && (
                      <div style={{ borderTop: '1px solid #2e3250', padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '240px', overflowY: 'auto' }}>
                        {models.map(m => (
                          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', borderBottom: '1px solid #ffffff08' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.id}>
                                {m.name ?? m.id}
                              </div>
                              <div style={{ fontSize: '9px', color: '#475569', fontFamily: 'monospace' }}>{m.id}</div>
                            </div>
                            {m.context_length && (
                              <span style={{ fontSize: '9px', color: '#475569', flexShrink: 0 }}>
                                {m.context_length >= 1000000
                                  ? `${(m.context_length / 1000000).toFixed(0)}M ctx`
                                  : m.context_length >= 1000
                                    ? `${(m.context_length / 1000).toFixed(0)}K ctx`
                                    : `${m.context_length} ctx`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrchestratorTab() {
  const [healthMap, setHealthMap] = useState<Map<string, ModelHealthRecord>>(new Map());
  const [snapshot, setSnapshot] = useState<OrchestratorSnapshot | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [showAiDetail, setShowAiDetail] = useState(false);
  const [message, setMessage] = useState('');

  const refreshAll = async () => {
    setHealthLoading(true);
    const snapshotData = await loadOrchestratorSnapshot();
    setHealthMap(deriveHealthMap(snapshotData));
    setSnapshot(snapshotData);
    setHealthLoading(false);
  };

  useEffect(() => {
    void refreshAll();
  }, []);

  const handleRunHealthcheck = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setMessage('헬스체크 실행 요청 중...');
    const result = await triggerModelHealthcheck();
    if (!result.success) {
      setMessage(result.message);
      setIsRunning(false);
      return;
    }

    setMessage('실행 완료 — 상태 갱신 중...');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await refreshAll();
    setMessage('갱신 완료');
    setIsRunning(false);
  };

  const providers = Object.values(snapshot?.providers ?? {});
  const bindings = snapshot?.bindings ?? [];
  const autoProjects = bindings.filter((binding) =>
    binding.enabled && ['firestore', 'file_edit', 'n8n_api'].includes(binding.patchMode),
  );
  const manualProjects = bindings.filter((binding) =>
    binding.enabled && !['firestore', 'file_edit', 'n8n_api'].includes(binding.patchMode),
  );
  const disabledProjects = bindings.filter((binding) =>
    !binding.enabled,
  );
  const configProjects = snapshot?.configs ?? [];

  return (
    <div className="section">
      <div className="section-header-row">
        <div>
          <p className="section-eyebrow">AI MODEL ORCHESTRATOR</p>
          <h2 className="section-title">오케스트레이터</h2>
          <p className="section-desc">Multi-trend dashboard 내부로 통합된 모델 헬스체크와 자동전환 현황</p>
        </div>
        <div className="section-header-actions">
          <button
            className="btn-action gray"
            onClick={() => void handleRunHealthcheck()}
            disabled={isRunning}
          >
            <RefreshCw size={14} className={isRunning ? 'spin' : ''} />
            {isRunning ? '실행 중...' : '수동 헬스체크'}
          </button>
          {message && (
            <p className={`section-note ${message.includes('실패') || message.includes('없습니다') ? 'error' : ''}`}>
              {message}
            </p>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Settings size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>통합 상태 요약</h3>
        </div>
        <div className="grid-3" style={{ gap: '0.5rem' }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Live 모델</div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{snapshot?.summary.liveModelCount ?? 0}</div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>Dead 모델</div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{snapshot?.summary.deadModelCount ?? 0}</div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: '0.25rem' }}>자동 적용 프로젝트</div>
            <div style={{ fontSize: '1rem', fontWeight: 600 }}>{snapshot?.summary.autoProjectCount ?? 0}</div>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Settings size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>프로젝트별 활성 설정</h3>
        </div>
        <div className="grid-2" style={{ gap: '0.75rem' }}>
          {configProjects.map((item) => (
            <div
              key={item.projectId}
              style={{
                background: 'var(--card-bg)',
                border: `1px solid ${item.ok ? 'var(--border)' : '#ef4444'}`,
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.displayName}</div>
                <span
                  className="badge"
                  style={item.ok
                    ? { background: '#16351f', color: '#22c55e', border: '1px solid #22c55e33' }
                    : { background: '#3a1a1a', color: '#ef4444', border: '1px solid #ef4444' }}
                >
                  {item.ok ? '조회 성공' : '조회 실패'}
                </span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.3rem', wordBreak: 'break-all' }}>{item.endpoint}</div>
              {item.config ? (
                <div style={{ marginTop: '0.6rem', fontSize: '0.8rem', lineHeight: 1.5 }}>
                  <div>Cerebras: {item.config.cerebras_model || '-'}</div>
                  <div>OR-1: {item.config.or_model || '-'}</div>
                  <div>OR-2: {item.config.or_model_2 || '-'}</div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: '0.25rem' }}>
                    {item.config.updated_at?.slice(0, 16).replace('T', ' ')} · {item.config.updated_by}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '0.6rem', fontSize: '0.78rem', color: '#ef4444' }}>
                  {item.error || '설정을 읽지 못했습니다.'}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Zap size={16} style={{ color: 'var(--accent)' }} />
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>모델 헬스 매트릭스</h3>
          {healthLoading && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>불러오는 중...</span>}
        </div>
        <div className="grid-3" style={{ gap: '0.5rem' }}>
          {MODEL_REGISTRY.filter((model) => model.id !== 'or-free').map((model) => {
            const health = healthMap.get(model.id);
            const status = health?.status ?? 'unknown';
            const dot = HEALTH_DOT[status] ?? '⚪';
            return (
              <div
                key={model.id}
                style={{
                  background: 'var(--card-bg)',
                  border: `1px solid ${status === 'error' ? '#ef4444' : status === 'ok' ? '#22c55e33' : 'var(--border)'}`,
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.3 }}>{model.displayName}</div>
                  <span style={{ fontSize: '1rem' }}>{dot}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                  {HEALTH_LABEL[status]}
                  {health?.latencyMs != null && ` · ${health.latencyMs}ms`}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                  {health?.checkedAt ? health.checkedAt.slice(0, 16).replace('T', ' ') : '미확인'}
                </div>
                {health?.errorMsg && (
                  <div style={{ fontSize: '0.68rem', color: '#ef4444', marginTop: '0.2rem' }}>{health.errorMsg}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={16} style={{ color: 'var(--accent)' }} />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>제공사 현황</h3>
          </div>
          <button
            onClick={() => setShowAiDetail(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              color: '#fff', border: 'none', borderRadius: '0.5rem',
              padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', transition: 'opacity 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            <ChevronRight size={13} /> AI 상세보기
          </button>
        </div>
        <div className="grid-3" style={{ gap: '0.5rem' }}>
          {providers.map((provider) => (
            <div
              key={provider.name}
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <div style={{ fontWeight: 600 }}>{provider.emoji} {provider.name}</div>
                <span
                  className="badge"
                  style={{
                    background: 'var(--card-bg)',
                    color: provider.hasKey ? '#22c55e' : '#f59e0b',
                    border: '1px solid var(--border)',
                  }}
                >
                  {provider.hasKey ? '키 있음' : '키 없음'}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>{provider.desc}</div>
              <div style={{ fontSize: '0.75rem', marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span>등록 모델 {provider.registeredModels.length}개 · 무료 {provider.freeCount}개</span>
                {provider.minLatencyMs != null && (
                  <span style={{ color: '#60a5fa', fontSize: '0.72rem', fontWeight: 600 }}>⚡ 최속 {provider.minLatencyMs}ms</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Zap size={16} style={{ color: '#22c55e' }} />
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>자동전환 프로젝트 ({autoProjects.length}개)</h3>
        </div>
        <div className="grid-2" style={{ gap: '0.75rem' }}>
          {autoProjects.map((binding) => {
            const projectMeta = findProjectMeta(binding);
            const models = binding.dashboardProjectId ? getModelsForProject(binding.dashboardProjectId) : [];
            const hasError = models.some((model) => healthMap.get(model.id)?.status === 'error');
            const statusMeta = getBindingStatusMeta(binding);

            return (
              <div key={binding.projectId} className="project-card" style={{ borderLeft: `3px solid ${hasError ? '#ef4444' : '#22c55e'}` }}>
                <div className="project-card-header">
                  <div>
                    <div className="project-card-name">{binding.displayName}</div>
                    <div className="project-card-cat">{binding.patchMode} · {projectMeta?.category ?? binding.targetType}</div>
                  </div>
                  <span className="badge" style={getBadgeStyle(statusMeta.tone)}>{statusMeta.label}</span>
                </div>
                <div className="tool-tags" style={{ marginTop: '0.5rem' }}>
                  {renderModelTags(binding, healthMap)}
                </div>
                <div className="flow-box" style={{ marginTop: '0.6rem', fontSize: '0.74rem' }}>
                  {statusMeta.reason}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Shield size={16} style={{ color: 'var(--muted)' }} />
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>수동 반영 프로젝트 ({manualProjects.length}개)</h3>
        </div>
        <div className="grid-2" style={{ gap: '0.75rem' }}>
          {manualProjects.map((binding) => {
            const projectMeta = findProjectMeta(binding);
            const statusMeta = getBindingStatusMeta(binding);
            return (
              <div key={binding.projectId} className="project-card" style={{ borderLeft: '3px solid var(--border)' }}>
                <div className="project-card-header">
                  <div>
                    <div className="project-card-name">{binding.displayName}</div>
                    <div className="project-card-cat">{binding.patchMode} · {projectMeta?.category ?? binding.targetType}</div>
                  </div>
                  <span className="badge" style={getBadgeStyle(statusMeta.tone)}>{statusMeta.label}</span>
                </div>
                <div className="tool-tags" style={{ marginTop: '0.5rem' }}>
                  {renderModelTags(binding, healthMap)}
                </div>
                <div className="flow-box" style={{ marginTop: '0.6rem', fontSize: '0.74rem' }}>
                  {statusMeta.reason}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Shield size={16} style={{ color: 'var(--muted)' }} />
          <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>비활성 프로젝트 ({disabledProjects.length}개)</h3>
        </div>
        <div className="grid-2" style={{ gap: '0.75rem' }}>
          {disabledProjects.map((binding) => {
            const projectMeta = findProjectMeta(binding);
            const statusMeta = getBindingStatusMeta(binding);
            return (
              <div key={binding.projectId} className="project-card" style={{ borderLeft: '3px solid #9ca3af' }}>
                <div className="project-card-header">
                  <div>
                    <div className="project-card-name">{binding.displayName}</div>
                    <div className="project-card-cat">{binding.patchMode} · {projectMeta?.category ?? binding.targetType}</div>
                  </div>
                  <span className="badge" style={getBadgeStyle(statusMeta.tone)}>{statusMeta.label}</span>
                </div>
                <div className="tool-tags" style={{ marginTop: '0.5rem' }}>
                  {renderModelTags(binding, healthMap)}
                </div>
                <div className="flow-box" style={{ marginTop: '0.6rem', fontSize: '0.74rem' }}>
                  {statusMeta.reason}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI 상세보기 모달 */}
      {showAiDetail && (
        <AiDetailModal
          snapshot={snapshot}
          onClose={() => setShowAiDetail(false)}
        />
      )}
    </div>
  );
}
