import { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp, Search, Sparkles, Loader2, ArrowRight, X } from 'lucide-react';
import type { TrendRecord } from '../../types/dashboard';
import { deleteTrendReportById, loadDashboardData, loadWithRetry } from '../../services/dashboardData';

export default function RadarTab() {
  const [trends, setTrends] = useState<TrendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState('');

  // 로컬 필터링 (시트 데이터 기반)
  const [localSearch, setLocalSearch] = useState('');

  // 실시간 AI 검색 (B안)
  const [aiSearchKeyword, setAiSearchKeyword] = useState('');
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [aiSearchMessage, setAiSearchMessage] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [sortBy, setSortBy] = useState<'date' | 'score'>('date');

  // 영어 제목 자동 번역 캐시 (localStorage 영속)
  const [translations, setTranslations] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('radar_title_ko') || '{}'); } catch { return {}; }
  });

  const isEnglish = (text: string) => {
    if (!text || text.length < 4) return false;
    const eng = (text.match(/[a-zA-Z]/g) || []).length;
    return eng / text.length > 0.45;
  };

  const translateTitle = async (id: string, text: string) => {
    if (!text || !isEnglish(text)) return;
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.substring(0, 200))}&langpair=en|ko`
      );
      const data = await res.json() as { responseStatus: number; responseData?: { translatedText: string } };
      if (data.responseStatus === 200 && data.responseData?.translatedText) {
        const ko = data.responseData.translatedText;
        setTranslations(prev => {
          const next = { ...prev, [id]: ko };
          try { localStorage.setItem('radar_title_ko', JSON.stringify(next)); } catch { }
          return next;
        });
      }
    } catch { /* silent */ }
  };

  useEffect(() => {
    trends.forEach(t => {
      if (isEnglish(t.title) && !translations[t.id]) {
        void translateTitle(t.id, t.title);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trends]);

  const load = async (): Promise<TrendRecord[]> => {
    setLoading(true);
    setWarning('');
    try {
      const data = await loadDashboardData();
      setTrends(data.trends);
      if (data.warnings.length) setWarning(data.warnings.join(' '));
      return data.trends;
    } catch {
      setWarning('데이터를 불러오지 못했습니다.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  // B안: 실시간 n8n 검색 요청 (Cloudflare Function 프록시 경유)
  const handleAiSearch = async () => {
    if (!aiSearchKeyword.trim()) return;
    setIsAiSearching(true);
    const keyword = aiSearchKeyword.trim();
    const beforeIds = new Set(trends.map((item) => item.id));
    setAiSearchMessage('AI가 구글 뉴스에서 기사를 찾고 본문을 크롤링하여 분석 중입니다... (약 1분 소요)');

    try {
      // /api/search → Cloudflare Function → n8n 웹훅 프록시
      // 로컬 개발 시: VITE_N8N_WEBHOOK_BASE 있으면 직접 호출, 없으면 /api/search 사용
      const searchUrl = `/api/search?keyword=${encodeURIComponent(keyword)}`;

      const res = await fetch(searchUrl, { method: 'GET' });

      if (res.ok) {
        type SearchResponse = { ok?: boolean; count?: number; items?: TrendRecord[] };
        const payload = (await res.json().catch(() => null)) as SearchResponse | null;

        // Google Sheets gviz 캐시 지연을 고려해 짧은 간격으로 재조회합니다.
        setAiSearchMessage('분석 완료! 구글 시트 동기화 대기 중...');
        setAiSearchKeyword('');
        setLocalSearch(''); // 필터 초기화 → 전체 목록 표시

        const { appended } = await loadWithRetry(
          async () => {
            setAiSearchMessage('분석 완료! 구글 시트 동기화 대기 중...');
            return load();
          },
          beforeIds,
          (item) => item.id,
          3,
          1500,
        );

        if (appended.length > 0) {
          setAiSearchMessage(`새 분석 결과 ${appended.length}건이 반영되었습니다.`);
        } else if ((payload?.count ?? 0) > 0) {
          setAiSearchMessage(
            '분석은 완료되었지만 구글 시트 동기화가 조금 더 필요합니다. 잠시 후 새로고침하면 결과가 보입니다.',
          );
        } else {
          setAiSearchMessage(
            `"${keyword}"는 저장 조건(점수 50+ / 중복 제외)을 통과한 기사가 없어 출력되지 않았습니다.`,
          );
        }
      } else if (res.status === 503) {
        // Cloudflare Function에서 N8N_WEBHOOK_BASE 미설정 안내
        const data = await res.json().catch(() => ({}));
        setAiSearchMessage(
          data.hint ?? 'On-Demand 검색을 사용하려면 Cloudflare Pages에서 N8N_WEBHOOK_BASE 환경변수를 설정하세요.',
        );
      } else {
        setAiSearchMessage(`검색 요청 중 오류가 발생했습니다. (HTTP ${res.status})`);
      }
    } catch {
      setAiSearchMessage(
        'n8n에 연결할 수 없습니다. n8n이 실행 중인지 확인하거나, Cloudflare Pages에서 N8N_WEBHOOK_BASE 환경변수를 설정하세요.',
      );
    } finally {
      setIsAiSearching(false);
      setTimeout(() => setAiSearchMessage(''), 8000);
    }
  };

  const filtered = trends
    .filter((t) => {
      if (!localSearch.trim()) return true;
      const q = localSearch.toLowerCase();
      return (
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.summary && t.summary.toLowerCase().includes(q)) ||
        (t.source && t.source.toLowerCase().includes(q)) ||
        (t.keyFacts && t.keyFacts.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === 'score') {
        return parseInt(String(b.score || '0'), 10) - parseInt(String(a.score || '0'), 10);
      }
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

  // 링크 기준 중복 제거 (점수 높은 것 유지)
  const deduped = (() => {
    const seen = new Map<string, TrendRecord>();
    for (const t of filtered) {
      const key = (t.link || t.title || t.id).split('?')[0].trim();
      const existing = seen.get(key);
      if (!existing || parseInt(String(t.score || '0'), 10) > parseInt(String(existing.score || '0'), 10)) {
        seen.set(key, t);
      }
    }
    return Array.from(seen.values());
  })();

  const totalPages = Math.max(1, Math.ceil(deduped.length / PAGE_SIZE));
  const paginated = deduped.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selected = trends.find((t) => t.id === selectedId) ?? null;
  const handleSelect = (id: string) => setSelectedId((prev) => (prev === id ? null : id));

  const handleDeleteTrend = async (id: string) => {
    if (deletingId) return;
    const ok = window.confirm('이 보고서를 삭제하시겠습니까?');
    if (!ok) return;

    setDeletingId(id);
    setWarning('');
    try {
      await deleteTrendReportById(id);
      const latest = await load();
      if (selectedId === id && !latest.some((item) => item.id === id)) {
        setSelectedId(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.';
      setWarning(message);
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (raw: string) => {
    if (!raw) return '';
    try { return new Date(raw).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return raw; }
  };

  // 프리미엄 색상 매퍼
  const getScoreColor = (scoreNum: number) => {
    if (scoreNum >= 85) return 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
    if (scoreNum >= 70) return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
    return 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)';
  };

  return (
    <div className="section" style={{ maxWidth: '1000px' }}>

      {/* 프리미엄 헤더 영역 */}
      <div style={{ marginBottom: '40px', paddingBottom: '20px', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <p style={{ fontSize: '12px', fontWeight: 800, color: '#4f46e5', letterSpacing: '0.15em', marginBottom: '8px' }}>INTELLIGENCE RADAR</p>
        <h2 style={{ fontSize: '42px', fontWeight: 900, color: '#0f172a', letterSpacing: '-1px', margin: '0 0 16px' }}>AI 딥서치 & 리포트</h2>
        <p style={{ fontSize: '15px', color: '#64748b', lineHeight: 1.6, maxWidth: '600px' }}>
          n8n 파이프라인이 전 세계 최신 기술 동향을 스크랩하고, 대형 언어 모델이 인과관계 분석부터 12개월 시장 예측까지 26개 관점의 심층 보고서를 생성합니다.
        </p>
      </div>

      {/* 액션 컨트롤 바 */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '36px',
        background: '#f8fafc', padding: '24px', borderRadius: '20px', border: '1px solid #e2e8f0'
      }}>
        {/* 상단: B안 실시간 AI 검색 */}
        <div style={{}}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#334155', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} color="#6366f1" /> 실시간 AI 타겟 탐색 (On-Demand)
          </h4>
          <div style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <input
              style={{
                flex: 1, padding: '14px 20px', fontSize: '15px', borderRadius: '12px',
                border: '1px solid #cbd5e1', background: '#fff', outline: 'none',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)', transition: 'border 0.2s'
              }}
              placeholder="예: '양자 컴퓨팅', 'Microsoft AI' 등 분석하고 싶은 키워드 입력..."
              value={aiSearchKeyword}
              onChange={(e) => setAiSearchKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAiSearch(); }}
              disabled={isAiSearching}
            />
            <button
              onClick={() => void handleAiSearch()}
              disabled={isAiSearching || !aiSearchKeyword.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '0 24px',
                background: isAiSearching ? '#94a3b8' : 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)',
                color: 'white', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 600,
                cursor: isAiSearching ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              {isAiSearching ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
              {isAiSearching ? '분석 중...' : '즉시 분석 요청'}
            </button>
          </div>
          {aiSearchMessage && (
            <p style={{
              marginTop: '12px', fontSize: '13px',
              color: aiSearchMessage === '기사가 출력되었음' ? '#16a34a' : '#6366f1',
              display: 'flex', alignItems: 'center', gap: '6px',
              fontWeight: aiSearchMessage === '기사가 출력되었음' ? 700 : 400
            }}>
              {isAiSearching && <Loader2 size={12} className="spin" />}
              {aiSearchMessage === '기사가 출력되었음' ? '✅ ' : ''}{aiSearchMessage}
            </p>
          )}
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0' }} />

        {/* 하단: DB 필터링 */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
            <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              style={{
                width: '100%', padding: '10px 14px 10px 40px', fontSize: '14px', borderRadius: '10px',
                border: '1px solid #cbd5e1', background: '#fff', outline: 'none'
              }}
              placeholder="저장된 보고서 빠른 검색..."
              value={localSearch}
              onChange={(e) => { setLocalSearch(e.target.value); setPage(1); }}
            />
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            style={{
              padding: '10px 16px', background: 'white', border: '1px solid #cbd5e1', color: '#475569',
              borderRadius: '10px', fontSize: '13px', fontWeight: 600, display: 'flex', gap: '6px',
              alignItems: 'center', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> DB 동기화
          </button>
          {/* 정렬 버튼 */}
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
            {(['date', 'score'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setSortBy(s); setPage(1); }}
                style={{
                  padding: '7px 14px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600,
                  background: sortBy === s ? '#4f46e5' : 'transparent',
                  color: sortBy === s ? '#fff' : '#64748b',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                {s === 'date' ? '최신순' : '점수별'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {warning && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px' }}>{warning}</div>}

      {/* 보고서 목록 */}
      {(loading || isAiSearching) ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isAiSearching && (
            <div style={{ padding: '24px', background: '#eff6ff', borderRadius: '16px', border: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Loader2 size={20} color="#3b82f6" className="spin" />
              <span style={{ fontSize: '14px', color: '#1d4ed8', fontWeight: 600 }}>AI가 뉴스를 수집하고 분석 중입니다... 잠시만 기다려 주세요.</span>
            </div>
          )}
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '80px', borderRadius: '16px' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '16px', border: '2px dashed #e2e8f0' }}>
          <Sparkles size={40} color="#cbd5e1" style={{ margin: '0 auto 12px' }} />
          <p style={{ color: '#64748b', fontSize: '15px' }}>{localSearch ? '검색된 보고서가 없습니다.' : '수집된 AI 보고서가 없습니다.'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {paginated.map((t) => {
            const isOpen = selectedId === t.id;
            const scoreNum = parseInt(String(t.score || '70'), 10);

            return (
              <div
                key={t.id}
                style={{
                  background: isOpen ? '#ffffff' : '#f8fafc',
                  border: isOpen ? '1px solid #cbd5e1' : '1px solid transparent',
                  borderRadius: '16px',
                  boxShadow: isOpen ? '0 12px 32px rgba(0,0,0,0.08)' : '0 2px 8px rgba(0,0,0,0.02)',
                  transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  overflow: 'hidden'
                }}
              >
                {/* 리스트 헤더 (항상 보임) */}
                <button
                  onClick={() => handleSelect(t.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', padding: '20px 24px',
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    gap: '20px'
                  }}
                >
                  {/* 스코어 뱃지 */}
                  {t.score && (
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      background: getScoreColor(scoreNum), color: 'white',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
                    }}>
                      <span style={{ fontSize: '18px', fontWeight: 800, lineHeight: 1.1 }}>{t.score}</span>
                      <span style={{ fontSize: '9px', fontWeight: 700, opacity: 0.8 }}>SCORE</span>
                    </div>
                  )}

                  {/* 텍스트 영역 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#4f46e5', background: '#e0e7ff', padding: '2px 8px', borderRadius: '20px' }}>
                        {t.source}
                      </span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{formatDate(t.date)}</span>
                    </div>
                    <h3 style={{
                      fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                    }}>
                      {translations[t.id] ?? t.title}
                    </h3>
                  </div>

                  {/* 아이콘 영역: 삭제 버튼 + 펼침 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); void handleDeleteTrend(t.id); }}
                      disabled={deletingId === t.id}
                      title="삭제"
                      style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: 'transparent', border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#f87171', cursor: 'pointer', opacity: 0.6,
                        transition: 'opacity 0.2s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                    >
                      {deletingId === t.id ? <Loader2 size={14} className="spin" /> : <X size={14} />}
                    </button>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: isOpen ? '#f1f5f9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOpen ? '#0f172a' : '#94a3b8', transition: 'all 0.2s' }}>
                      {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>
                </button>

                {/* 보고서 내용 영역 (펼쳤을 때) */}
                {isOpen && selected && (
                  <div style={{ padding: '0 24px 32px', borderTop: '1px solid #f1f5f9', animation: 'fadeIn 0.4s ease' }}>

                    {/* 최상단 요약 & 링크 */}
                    <div style={{ padding: '24px 0 20px', display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                      <div style={{ flex: 1, minWidth: '300px' }}>
                        <p style={{ fontSize: '16px', color: '#334155', lineHeight: 1.6, margin: '0 0 16px', fontWeight: 500 }}>
                          {selected.summary}
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {selected.link && (
                            <a href={selected.link} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#4f46e5', textDecoration: 'none', padding: '8px 16px', background: '#e0e7ff', borderRadius: '8px', transition: 'background 0.2s' }}>
                              원문 기사 읽기 <ArrowRight size={14} />
                            </a>
                          )}
                          <button
                            onClick={() => { void handleDeleteTrend(selected.id); }}
                            disabled={deletingId === selected.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              fontSize: '13px',
                              fontWeight: 700,
                              color: '#991b1b',
                              padding: '8px 16px',
                              borderRadius: '8px',
                              border: '1px solid #fecaca',
                              background: deletingId === selected.id ? '#fef2f2' : '#fff1f2',
                              cursor: deletingId === selected.id ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {deletingId === selected.id ? '삭제 중...' : '기사 삭제'}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* 인텔리전스 그리드: 상단 2컬럼 + 하단 FORECAST 풀폭 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '10px' }}>
                      {/* 상단 2컬럼 */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                        {/* 그룹 1: 핵심 및 원인 */}
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                          <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.05em' }}>Fact &amp; Cause</h4>
                          {[
                            { l: '🔑 핵심 팩트', v: selected.keyFacts },
                            { l: '❗ 중요성', v: selected.whyImportant },
                            { l: '🔗 인과 분석', v: selected.causalAnalysis }
                          ].map(s => s.v && (
                            <div key={s.l} style={{ marginBottom: '16px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{s.l}</div>
                              <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>{s.v}</div>
                            </div>
                          ))}
                        </div>
                        {/* 그룹 2: 영향 및 실행 */}
                        <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                          <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.05em' }}>Impact &amp; Action</h4>
                          {[
                            { l: '🏭 산업 영향도', v: selected.industryImpact },
                            { l: '🌊 파급 효과', v: selected.secondOrderEffect },
                            { l: '⚡ 실행 전략', v: selected.actionPoint }
                          ].map(s => s.v && (
                            <div key={s.l} style={{ marginBottom: '16px' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>{s.l}</div>
                              <div style={{ fontSize: '14px', color: '#475569', lineHeight: 1.6 }}>{s.v}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* FORECAST — 풀폭 다크 카드 */}
                      <div style={{ background: '#0f172a', padding: '24px', borderRadius: '16px', border: '1px solid #1e293b' }}>
                        <h4 style={{ fontSize: '12px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '16px', letterSpacing: '0.05em' }}>Forecast</h4>
                        {(selected.forecast3m || selected.forecast12m) && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                            {selected.forecast3m && (
                              <div style={{ background: '#1e293b', padding: '14px', borderRadius: '10px' }}>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>3개월 예측</div>
                                <div style={{ fontSize: '14px', color: '#f8fafc', lineHeight: 1.6 }}>{selected.forecast3m}</div>
                              </div>
                            )}
                            {selected.forecast12m && (
                              <div style={{ background: '#1e293b', padding: '14px', borderRadius: '10px' }}>
                                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>12개월 예측</div>
                                <div style={{ fontSize: '14px', color: '#f8fafc', lineHeight: 1.6 }}>{selected.forecast12m}</div>
                              </div>
                            )}
                          </div>
                        )}
                        {(selected.scenarioBase || selected.scenarioBull || selected.scenarioBear) && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {selected.scenarioBase && (
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ padding: '4px 8px', background: '#4f46e5', color: '#fff', fontSize: '11px', fontWeight: 800, borderRadius: '6px', whiteSpace: 'nowrap' }}>기본 {selected.probabilityBase}%</div>
                                <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>{selected.scenarioBase}</div>
                              </div>
                            )}
                            {selected.scenarioBull && (
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ padding: '4px 8px', background: '#10b981', color: '#fff', fontSize: '11px', fontWeight: 800, borderRadius: '6px', whiteSpace: 'nowrap' }}>낙관 {selected.probabilityBull}%</div>
                                <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>{selected.scenarioBull}</div>
                              </div>
                            )}
                            {selected.scenarioBear && (
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                <div style={{ padding: '4px 8px', background: '#e11d48', color: '#fff', fontSize: '11px', fontWeight: 800, borderRadius: '6px', whiteSpace: 'nowrap' }}>비관 {selected.probabilityBear}%</div>
                                <div style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: 1.6 }}>{selected.scenarioBear}</div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 페이지네이션 */}
      {!loading && !isAiSearching && totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '32px', flexWrap: 'wrap' }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => { setPage(p); setSelectedId(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              style={{
                width: '36px', height: '36px', borderRadius: '8px', border: 'none',
                background: p === page ? 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)' : '#f1f5f9',
                color: p === page ? '#fff' : '#475569',
                fontWeight: p === page ? 800 : 500,
                fontSize: '14px', cursor: 'pointer',
                boxShadow: p === page ? '0 4px 10px rgba(79,70,229,0.3)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
