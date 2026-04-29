import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  BookOpen,
  Clock3,
  ExternalLink,
  FolderKanban,
  Info,
  RefreshCcw,
  Search,
  Star,
  TrendingUp,
  X,
  Play,
} from 'lucide-react';
import { loadWithRetry, loadYoutubeVideos, triggerYoutubeSync } from '../../services/dashboardData';
import type { TabId, YoutubeVideo } from '../../types/dashboard';

interface YoutubeTabProps {
  onNavigate?: (tab: TabId) => void;
}

type SortOption = 'latest' | 'recommended' | 'channel';

interface ChannelMeta {
  id: string;
  name: string;
  handle: string;
  desc: string;
  color: string;
  url: string;
  keywords: string[];
}

interface YoutubeVideoView extends YoutubeVideo {
  resolvedChannelId: string;
  resolvedChannelName: string;
  resolvedChannelHandle: string;
  resolvedColor: string;
  resolvedTopic: string;
  resolvedSummary: string;
  resolvedStrategic: string;
  resolvedVideoUrl: string;
  resolvedThumb: string;
}

const CHANNELS: ChannelMeta[] = [
  {
    id: 'UCKfyUo_J1jQiD3QRpnIXYnw',
    name: '제미퍼 캔버스',
    handle: '@najh-f1b',
    desc: 'AI 창작과 생성형 예술을 실험하는 채널',
    color: '#7c3aed',
    url: 'https://www.youtube.com/@najh-f1b',
    keywords: ['AI 창작', '생성형 예술', '디지털 아트'],
  },
  {
    id: 'UCvCft52OeMIycogpNDzvamg',
    name: '알아두면 돈 버는 생활상식',
    handle: '@jhn6128',
    desc: '생활 밀착형 절약과 재테크 팁을 전하는 채널',
    color: '#059669',
    url: 'https://www.youtube.com/@jhn6128',
    keywords: ['재테크', '절약', '생활 정보'],
  },
  {
    id: 'UCqMYYSsphHKEi3mPhYSzWZA',
    name: '디지털 트렌드 종합 선물세트 실험',
    handle: '@njh7940',
    desc: '디지털 트렌드와 실험형 IT 콘텐츠 채널',
    color: '#0284c7',
    url: 'https://www.youtube.com/@njh7940',
    keywords: ['디지털 트렌드', 'IT 실험', 'AI 활용'],
  },
];

const DEFAULT_TOPIC = '미분류';

const parseDate = (value: string): number => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const formatDate = (value: string): string => {
  const time = parseDate(value);
  if (!time) {
    return '날짜 미상';
  }
  return new Date(time).toLocaleDateString();
};

const createVideoView = (video: YoutubeVideo): YoutubeVideoView => {
  const byId = CHANNELS.find((channel) => channel.id === video.channelId);
  const byHandle = CHANNELS.find((channel) => channel.handle === video.channelHandle);
  const byName = CHANNELS.find((channel) => channel.name === video.channelName);
  const matched = byId ?? byHandle ?? byName ?? CHANNELS[0];

  return {
    ...video,
    resolvedChannelId: video.channelId || matched.id,
    resolvedChannelName: video.channelName || matched.name,
    resolvedChannelHandle: video.channelHandle || matched.handle,
    resolvedColor: video.color || matched.color,
    resolvedTopic: video.topicCluster || DEFAULT_TOPIC,
    resolvedSummary: video.oneLineSummary || `${matched.name} 채널의 최신 콘텐츠`,
    resolvedStrategic: video.strategicAngle || '관련 탭으로 연결해 확장 탐색을 추천합니다.',
    resolvedVideoUrl: video.videoUrl || `https://www.youtube.com/watch?v=${video.videoId}`,
    resolvedThumb: video.thumbnailUrl || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
  };
};

const getSortLabel = (sortBy: SortOption): string => {
  if (sortBy === 'recommended') return '추천순';
  if (sortBy === 'channel') return '채널순';
  return '최신순';
};

export default function YoutubeTab({ onNavigate }: YoutubeTabProps) {
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState(CHANNELS[0].id);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [topicFilter, setTopicFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('latest');
  const [query, setQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<YoutubeVideoView | null>(null);

  const fetchVideos = async (): Promise<YoutubeVideo[]> => {
    setIsLoading(true);
    try {
      const data = await loadYoutubeVideos();
      setVideos(data);
      return data;
    } catch (error) {
      console.error('Failed to load youtube videos', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchVideos();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncNote('');
    const beforeIds = new Set(videos.map((video) => video.videoId));

    try {
      const result = await triggerYoutubeSync();
      if (!result.success) {
        setSyncNote('n8n 동기화 요청에 실패했습니다. 로컬 n8n 상태를 확인해 주세요.');
        return;
      }

      setSyncNote('동기화 요청을 보냈습니다. 유튜브 시트 반영을 확인하는 중입니다...');
      const { appended } = await loadWithRetry(
        async () => {
          setSyncNote('동기화 요청을 보냈습니다. 유튜브 시트 반영을 확인하는 중입니다...');
          return fetchVideos();
        },
        beforeIds,
        (video) => video.videoId,
        2,
        1200,
      );

      if (appended.length > 0) {
        setSyncNote(`유튜브 데이터 ${appended.length}건이 새로 반영되었습니다.`);
      } else {
        setSyncNote('동기화 요청은 완료되었습니다. 새 데이터가 없거나 반영까지 조금 더 걸릴 수 있습니다.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const videoViews = useMemo(() => videos.map(createVideoView), [videos]);

  const selectedChannel = useMemo(
    () => CHANNELS.find((channel) => channel.id === selectedChannelId) ?? CHANNELS[0],
    [selectedChannelId],
  );

  const heroChannelVideos = useMemo(
    () =>
      videoViews.filter(
        (video) =>
          video.resolvedChannelId === selectedChannel.id ||
          video.resolvedChannelHandle === selectedChannel.handle,
      ),
    [selectedChannel, videoViews],
  );

  const featuredVideos = useMemo(() => {
    return CHANNELS.map((channel) => {
      const candidates = videoViews
        .filter(
          (video) =>
            video.resolvedChannelId === channel.id || video.resolvedChannelHandle === channel.handle,
        )
        .sort((a, b) => parseDate(b.published) - parseDate(a.published));

      const featured = candidates.find((video) => video.isFeatured);
      return featured ?? candidates[0] ?? null;
    }).filter((video): video is YoutubeVideoView => video !== null);
  }, [videoViews]);

  const channelScopedVideos = useMemo(() => {
    if (channelFilter === 'all') {
      return videoViews;
    }
    return videoViews.filter((video) => video.resolvedChannelId === channelFilter);
  }, [channelFilter, videoViews]);

  const topicGroups = useMemo(() => {
    const countMap = new Map<string, number>();
    channelScopedVideos.forEach((video) => {
      const key = video.resolvedTopic || DEFAULT_TOPIC;
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    });

    return [...countMap.entries()]
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count);
  }, [channelScopedVideos]);

  useEffect(() => {
    if (topicFilter === 'all') {
      return;
    }
    const exists = topicGroups.some((group) => group.topic === topicFilter);
    if (!exists) {
      setTopicFilter('all');
    }
  }, [topicFilter, topicGroups]);

  const filteredVideos = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const base = channelScopedVideos.filter((video) => {
      const topicMatched = topicFilter === 'all' || video.resolvedTopic === topicFilter;
      if (!topicMatched) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const searchBlob = [
        video.title,
        video.resolvedSummary,
        video.resolvedTopic,
        video.contentType,
        video.resolvedStrategic,
        video.resolvedChannelName,
      ]
        .join(' ')
        .toLowerCase();

      return searchBlob.includes(keyword);
    });

    return [...base].sort((a, b) => {
      if (sortBy === 'recommended') {
        if (a.isFeatured !== b.isFeatured) {
          return a.isFeatured ? -1 : 1;
        }
        return parseDate(b.published) - parseDate(a.published);
      }

      if (sortBy === 'channel') {
        const byName = a.resolvedChannelName.localeCompare(b.resolvedChannelName, 'ko');
        if (byName !== 0) return byName;
        return parseDate(b.published) - parseDate(a.published);
      }

      return parseDate(b.published) - parseDate(a.published);
    });
  }, [channelScopedVideos, query, sortBy, topicFilter]);

  const openVideoDrawer = (video: YoutubeVideoView) => {
    setSelectedVideo(video);
  };

  const closeVideoDrawer = () => {
    setSelectedVideo(null);
  };

  return (
    <section className="section-sm youtube-hub">
      <header className="youtube-header">
        <div>
          <p className="section-eyebrow">YouTube Intelligence Hub</p>
          <h2 className="section-title">유튜브 콘텐츠 인텔리전스</h2>
          <p className="section-desc">
            채널 소개, 주제 탐색, 상세 맥락, 내부 전환까지 한 번에 이어지는 운영형 유튜브 허브입니다.
          </p>
        </div>
        <button onClick={handleSync} disabled={isSyncing} className="btn-primary">
          <RefreshCcw size={15} className={isSyncing ? 'spin' : ''} />
          {isSyncing ? '동기화 중...' : 'DB 동기화'}
        </button>
      </header>

      {syncNote && <p className="youtube-sync-note">{syncNote}</p>}

      <div className="youtube-hero" style={{ '--youtube-theme': selectedChannel.color } as CSSProperties}>
        <div className="youtube-hero-main">
          <p className="youtube-hero-kicker">{selectedChannel.handle}</p>
          <h3>{selectedChannel.name}</h3>
          <p>{selectedChannel.desc}</p>
          <div className="youtube-keywords">
            {selectedChannel.keywords.map((keyword) => (
              <span key={keyword}>{keyword}</span>
            ))}
          </div>
          <div className="youtube-hero-meta">
            <span>영상 {heroChannelVideos.length}개</span>
            <span>대표 영상 {heroChannelVideos.filter((video) => video.isFeatured).length}개</span>
            <span>최근 업데이트 {heroChannelVideos[0] ? formatDate(heroChannelVideos[0].published) : '준비 중'}</span>
          </div>
          <a href={selectedChannel.url} target="_blank" rel="noopener noreferrer" className="btn-action">
            <Play size={15} />
            채널 바로가기
          </a>
        </div>

        <div className="youtube-channel-switcher">
          {CHANNELS.map((channel) => {
            const isActive = channel.id === selectedChannel.id;
            return (
              <button
                key={channel.id}
                type="button"
                className={`youtube-channel-card${isActive ? ' active' : ''}`}
                onClick={() => setSelectedChannelId(channel.id)}
              >
                <span className="swatch" style={{ background: channel.color }} />
                <strong>{channel.name}</strong>
                <small>{channel.handle}</small>
              </button>
            );
          })}
        </div>
      </div>

      <section className="youtube-section">
        <div className="youtube-section-head">
          <h3>Featured Videos</h3>
          <p>채널별 대표 영상 또는 최근 핵심 영상을 우선 노출합니다.</p>
        </div>
        <div className="youtube-featured-grid">
          {featuredVideos.map((video) => (
            <article key={`featured-${video.videoId}`} className="youtube-featured-card">
              <button type="button" className="thumb-btn" onClick={() => openVideoDrawer(video)}>
                <img src={video.resolvedThumb} alt={video.title} />
              </button>
              <div className="youtube-featured-body">
                <span className="badge badge-purple">{video.resolvedChannelName}</span>
                {video.isFeatured && (
                  <span className="badge badge-amber">
                    <Star size={12} />
                    대표
                  </span>
                )}
                <h4>{video.title}</h4>
                <p>{video.resolvedSummary}</p>
                <div className="youtube-inline-actions">
                  <button type="button" className="btn-action gray" onClick={() => openVideoDrawer(video)}>
                    상세 보기
                  </button>
                  <a href={video.resolvedVideoUrl} target="_blank" rel="noopener noreferrer" className="btn-action">
                    <ExternalLink size={14} />
                    영상 보기
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="youtube-section">
        <div className="youtube-section-head">
          <h3>Smart Topic Explorer</h3>
          <p>관심 주제 중심으로 빠르게 탐색할 수 있습니다.</p>
        </div>
        <div className="youtube-topic-chips">
          <button
            type="button"
            className={`tag-chip${topicFilter === 'all' ? ' active' : ''}`}
            onClick={() => setTopicFilter('all')}
          >
            전체 주제
          </button>
          {topicGroups.map((group) => (
            <button
              key={group.topic}
              type="button"
              className={`tag-chip${topicFilter === group.topic ? ' active' : ''}`}
              onClick={() => setTopicFilter(group.topic)}
            >
              {group.topic} ({group.count})
            </button>
          ))}
        </div>
      </section>

      <section className="youtube-section">
        <div className="youtube-section-head">
          <h3>Latest Videos Grid</h3>
          <p>
            검색, 채널 필터, 주제 필터, 정렬을 조합해 원하는 콘텐츠를 찾고 내부 상세 패널에서 먼저 맥락을
            확인하세요.
          </p>
        </div>

        <div className="youtube-controls">
          <label className="youtube-search">
            <Search size={15} />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 요약, 주제, 전략 포인트 검색"
            />
          </label>

          <div className="youtube-control-group">
            <span>채널</span>
            <div className="youtube-pill-row">
              <button
                type="button"
                className={`tag-chip${channelFilter === 'all' ? ' active' : ''}`}
                onClick={() => setChannelFilter('all')}
              >
                전체
              </button>
              {CHANNELS.map((channel) => (
                <button
                  type="button"
                  key={channel.id}
                  className={`tag-chip${channelFilter === channel.id ? ' active' : ''}`}
                  onClick={() => setChannelFilter(channel.id)}
                >
                  {channel.name}
                </button>
              ))}
            </div>
          </div>

          <div className="youtube-control-group">
            <span>정렬</span>
            <div className="youtube-pill-row">
              {(['latest', 'recommended', 'channel'] as SortOption[]).map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`tag-chip${sortBy === option ? ' active' : ''}`}
                  onClick={() => setSortBy(option)}
                >
                  {getSortLabel(option)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="youtube-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <article key={`skeleton-${index}`} className="youtube-video-card">
                <div className="skeleton youtube-video-thumb-skeleton" />
                <div className="youtube-video-body">
                  <div className="skeleton youtube-line-skeleton-lg" />
                  <div className="skeleton youtube-line-skeleton-sm" />
                </div>
              </article>
            ))}
          </div>
        ) : filteredVideos.length > 0 ? (
          <div className="youtube-grid">
            {filteredVideos.map((video) => (
              <article key={video.videoId} className="youtube-video-card">
                <button type="button" className="thumb-btn" onClick={() => openVideoDrawer(video)}>
                  <img src={video.resolvedThumb} alt={video.title} />
                  <span className="youtube-channel-badge" style={{ background: `${video.resolvedColor}dd` }}>
                    {video.resolvedChannelName}
                  </span>
                </button>
                <div className="youtube-video-body">
                  <h4 className="line-clamp-2">{video.title}</h4>
                  <p className="line-clamp-2">{video.resolvedSummary}</p>
                  <div className="youtube-meta-row">
                    <span>
                      <Clock3 size={12} />
                      {formatDate(video.published)}
                    </span>
                    <span>{video.resolvedTopic}</span>
                  </div>
                  <div className="youtube-inline-actions">
                    <button type="button" className="btn-action gray" onClick={() => openVideoDrawer(video)}>
                      상세
                    </button>
                    <a href={video.resolvedVideoUrl} target="_blank" rel="noopener noreferrer" className="btn-action">
                      <ExternalLink size={14} />
                      보기
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Info size={32} />
            <p>조건에 맞는 영상이 없습니다. 필터를 초기화하거나 동기화를 실행해 주세요.</p>
          </div>
        )}
      </section>

      <section className="youtube-section">
        <div className="youtube-section-head">
          <h3>Cross-Link CTA</h3>
          <p>유튜브 콘텐츠를 대시보드의 다른 자산과 바로 연결합니다.</p>
        </div>
        <div className="youtube-cta-grid">
          <button type="button" className="youtube-cta-card" onClick={() => onNavigate?.('trends')}>
            <TrendingUp size={20} />
            <strong>AI 딥서치 보기</strong>
            <span>영상 주제와 연결된 트렌드 리포트로 이동</span>
          </button>
          <button type="button" className="youtube-cta-card" onClick={() => onNavigate?.('lectures')}>
            <BookOpen size={20} />
            <strong>강의 자료 확인</strong>
            <span>영상 기반 학습 자료를 바로 탐색</span>
          </button>
          <button type="button" className="youtube-cta-card" onClick={() => onNavigate?.('projects')}>
            <FolderKanban size={20} />
            <strong>프로젝트 체험</strong>
            <span>영상 속 서비스와 프로젝트를 직접 사용</span>
          </button>
        </div>
      </section>

      {selectedVideo && (
        <div className="youtube-drawer-backdrop" role="presentation" onClick={closeVideoDrawer}>
          <aside
            className="youtube-drawer"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="youtube-drawer-head">
              <strong>Video Detail Drawer</strong>
              <button type="button" onClick={closeVideoDrawer} aria-label="상세 패널 닫기">
                <X size={18} />
              </button>
            </header>
            <img src={selectedVideo.resolvedThumb} alt={selectedVideo.title} className="youtube-drawer-thumb" />
            <div className="youtube-drawer-body">
              <p className="youtube-drawer-channel">{selectedVideo.resolvedChannelName}</p>
              <h4>{selectedVideo.title}</h4>
              <p className="youtube-drawer-date">{formatDate(selectedVideo.published)}</p>
              <div className="youtube-drawer-tags">
                <span className="badge badge-blue">{selectedVideo.resolvedTopic}</span>
                {selectedVideo.contentType && <span className="badge badge-green">{selectedVideo.contentType}</span>}
                {selectedVideo.isFeatured && (
                  <span className="badge badge-amber">
                    <Star size={12} />
                    대표 영상
                  </span>
                )}
              </div>
              <p>{selectedVideo.resolvedSummary}</p>
              <div className="youtube-drawer-note">
                <strong>전략 포인트</strong>
                <p>{selectedVideo.resolvedStrategic}</p>
              </div>
              <div className="youtube-drawer-links">
                <a href={selectedVideo.resolvedVideoUrl} target="_blank" rel="noopener noreferrer" className="btn-action">
                  <ExternalLink size={14} />
                  유튜브에서 보기
                </a>
                <button type="button" className="btn-action gray" onClick={() => onNavigate?.('trends')}>
                  <TrendingUp size={14} />
                  관련 트렌드
                </button>
                <button type="button" className="btn-action gray" onClick={() => onNavigate?.('lectures')}>
                  <BookOpen size={14} />
                  관련 강의
                </button>
                <button type="button" className="btn-action gray" onClick={() => onNavigate?.('projects')}>
                  <FolderKanban size={14} />
                  관련 프로젝트
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
