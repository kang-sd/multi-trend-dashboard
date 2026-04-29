import { useEffect, useState } from 'react';
import { ExternalLink, Download, Copy, RefreshCw } from 'lucide-react';
import type { LectureRecord } from '../../types/dashboard';
import { loadDashboardData, loadWithRetry, syncLecturesFromDriveFolder } from '../../services/dashboardData';

const getPrimaryActionLabel = (title: string): string => {
  const normalized = title.toLowerCase();
  if (normalized.endsWith('.ppt') || normalized.endsWith('.pptx')) {
    return '슬라이드쇼';
  }
  if (normalized.endsWith('.doc') || normalized.endsWith('.docx')) {
    return '문서 보기';
  }
  return '미리보기';
};

export default function LectureTab() {
  const [lectures, setLectures] = useState<LectureRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('전체');
  const [warning, setWarning] = useState('');
  const [syncNote, setSyncNote] = useState('');

  const fetchLectures = async (): Promise<LectureRecord[]> => {
    setLoading(true);
    setWarning('');
    try {
      const data = await loadDashboardData();
      setLectures(data.lectures);
      if (data.warnings.length) {
        setWarning(data.warnings.join(' '));
      }
      return data.lectures;
    } catch {
      setWarning('강의 목록을 불러오지 못했습니다.');
      return [];
    } finally {
      setLoading(false);
    }
  };

  const load = async (withSync = false) => {
    if (withSync) {
      try {
        await syncLecturesFromDriveFolder();
      } catch {
        // 동기화 실패 시에도 기존 시트 데이터는 표시한다.
      }
    }
    return fetchLectures();
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncNote('');
    const beforeIds = new Set(lectures.map((lecture) => lecture.id));

    try {
      await syncLecturesFromDriveFolder();
      setSyncNote('Drive 동기화 요청을 보냈습니다. 강의 시트 반영을 확인하는 중입니다...');
      const { appended } = await loadWithRetry(
        async () => {
          setSyncNote('Drive 동기화 요청을 보냈습니다. 강의 시트 반영을 확인하는 중입니다...');
          return fetchLectures();
        },
        beforeIds,
        (lecture) => lecture.id,
        2,
        1200,
      );

      if (appended.length > 0) {
        setSyncNote(`강의 자료 ${appended.length}건이 새로 반영되었습니다.`);
      } else {
        setSyncNote('동기화 요청은 완료되었습니다. 새 자료가 없거나 반영까지 조금 더 걸릴 수 있습니다.');
      }
    } catch {
      setSyncNote('Drive 폴더 동기화에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      await fetchLectures();
    } finally {
      setIsSyncing(false);
    }
  };

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(true); }, []);

  const allTags = [
    '전체',
    ...Array.from(
      new Set(
        lectures.flatMap((lecture) =>
          lecture.tags
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
        ),
      ),
    ),
  ];

  const filtered = lectures.filter((lecture) => {
    const matchSearch = !search || lecture.title.includes(search) || lecture.summary.includes(search);
    const matchTag = tag === '전체' || lecture.tags.includes(tag);
    return matchSearch && matchTag;
  });

  return (
    <div className="section">
      <div style={{ marginBottom: '28px' }}>
        <p className="section-eyebrow">LECTURE HUB</p>
        <h2 className="section-title" style={{ marginBottom: '4px' }}>강의 허브</h2>
        <p className="section-desc" style={{ marginBottom: 0 }}>
          Drive DB 폴더의 강의자료 목록을 확인하고 바로 미리보기
        </p>
      </div>

      {warning && <div className="alert alert-error">{warning}</div>}
      {syncNote && <div className="alert alert-info">{syncNote}</div>}

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input
          className="form-input"
          style={{ flex: '1', minWidth: '180px' }}
          placeholder="강의 검색..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button className="btn-outline" onClick={() => void handleSync()} disabled={loading || isSyncing}>
          <RefreshCw size={14} />
        </button>
      </div>

      {allTags.length > 1 && (
        <div className="tag-filter">
          {allTags.map((item) => (
            <button
              key={item}
              className={`tag-chip${tag === item ? ' active' : ''}`}
              onClick={() => setTag(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="lecture-card">
              <div className="skeleton" style={{ height: '22px', marginBottom: '8px' }} />
              <div className="skeleton" style={{ height: '14px', width: '60%', marginBottom: '12px' }} />
              <div className="skeleton" style={{ height: '60px' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span style={{ fontSize: '40px' }}>📚</span>
          <p>{search || tag !== '전체' ? '검색 결과가 없습니다.' : '등록된 강의자료가 없습니다.'}</p>
        </div>
      ) : (
        <div className="grid-2 fade-in">
          {filtered.map((lecture) => (
            <div key={lecture.id} className="lecture-card">
              <div className="lecture-card-title">{lecture.title}</div>
              <div className="lecture-card-meta">
                {lecture.speaker}
                {lecture.published && ` · ${lecture.published.slice(0, 10)}`}
                {lecture.tags && (
                  <span style={{ marginLeft: '8px' }}>
                    {lecture.tags
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((item) => (
                        <span
                          key={item}
                          className="badge badge-blue"
                          style={{ marginRight: '4px', cursor: 'pointer' }}
                          onClick={() => setTag(item)}
                        >
                          {item}
                        </span>
                      ))}
                  </span>
                )}
              </div>
              {lecture.summary && (
                <div className="lecture-card-desc line-clamp-3">{lecture.summary}</div>
              )}
              {lecture.link && (
                <div className="lecture-actions">
                  <a href={lecture.link} target="_blank" rel="noopener noreferrer" className="btn-action">
                    <ExternalLink size={12} />
                    {getPrimaryActionLabel(lecture.title)}
                  </a>
                  <a
                    href={`https://drive.google.com/uc?export=download&id=${lecture.driveFileId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-action gray"
                  >
                    <Download size={12} />
                    다운로드
                  </a>
                  <button
                    className="btn-action gray"
                    onClick={() => void navigator.clipboard.writeText(lecture.summary)}
                  >
                    <Copy size={12} />
                    요약 복사
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
