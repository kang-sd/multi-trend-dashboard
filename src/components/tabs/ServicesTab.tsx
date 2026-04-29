import { useState } from 'react';
import { ExternalLink, Sparkles } from 'lucide-react';
import { PROJECTS } from '../../data/projects';

const CATEGORY_ICONS: Record<string, string> = {
  '자기이해': '🧠',
  '커리어': '💼',
  '건강': '❤️',
  '데이터 분석': '📊',
  '금융': '💹',
  '포트폴리오': '🌟',
  '자동화': '⚙️',
};

const SERVICES = PROJECTS.filter((p) => p.url && p.status === 'active');
const CATEGORIES = ['전체', ...Array.from(new Set(SERVICES.map((p) => p.category)))];

export default function ServicesTab() {
  const [cat, setCat] = useState('전체');
  const filtered = cat === '전체' ? SERVICES : SERVICES.filter((p) => p.category === cat);

  return (
    <>
      <div className="hero">
        <div>
          <div className="hero-eyebrow">
            <Sparkles size={13} />
            AI-Powered Portfolio
          </div>
          <h1 className="hero-title">
            AI로 만드는<br />
            <span>나만의 서비스</span>
          </h1>
          <p className="hero-desc">
            사주팔자부터 건강 분석까지 — 일상의 질문에 AI가 답하는
            실험적 서비스들을 직접 만들고 운영합니다.
          </p>
          <div className="hero-cta">
            <a
              href="https://seoung-do.web.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
            >
              <ExternalLink size={14} />
              통합 포털 방문
            </a>
          </div>
          <div className="hero-stats">
            <div>
              <div className="hero-stat-value">{SERVICES.length}</div>
              <div className="hero-stat-label">운영 중인 서비스</div>
            </div>
            <div>
              <div className="hero-stat-value">7+</div>
              <div className="hero-stat-label">AI 모델 활용</div>
            </div>
            <div>
              <div className="hero-stat-value">무료</div>
              <div className="hero-stat-label">모든 서비스</div>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ fontSize: '72px', marginBottom: '16px' }}>🤖</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gray-700)' }}>AI Services</div>
            <div style={{ fontSize: '14px', color: 'var(--gray-400)', marginTop: '8px' }}>by Seoung-do</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '20px', flexWrap: 'wrap' }}>
              {['Firebase', 'OpenRouter', 'Cerebras', 'Groq'].map((t) => (
                <span key={t} className="tool-tag" style={{ fontSize: '12px' }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="section" style={{ paddingTop: 0 }}>
        <p className="section-eyebrow">SERVICES</p>
        <h2 className="section-title">운영 중인 서비스</h2>

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

        <div className="grid-3 fade-in">
          {filtered.map((p) => (
            <div key={p.id} className="service-card">
              <div className="service-card-icon">
                <span style={{ fontSize: '24px' }}>{CATEGORY_ICONS[p.category] ?? '🔮'}</span>
              </div>
              <div>
                <div className="service-card-cat">{p.category}</div>
                <div className="service-card-name">{p.name}</div>
              </div>
              <p className="service-card-desc">{p.desc}</p>
              <div className="service-card-footer">
                <span className="badge badge-green">운영 중</span>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-action"
                >
                  <ExternalLink size={12} />
                  바로가기
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
