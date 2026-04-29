import { GitBranch } from 'lucide-react';
import type { TabId } from '../../types/dashboard';

interface Props {
  active: TabId;
  onNav: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'services', label: '서비스' },
  { id: 'trends', label: 'AI 트렌드' },
  { id: 'lectures', label: '강의' },
  { id: 'youtube', label: '유튜브' },
  { id: 'projects', label: '프로젝트' },
  { id: 'orchestrator', label: '오케스트레이터' },
];

export default function TopNav({ active, onNav }: Props) {
  return (
    <nav className="top-nav">
      <button
        className="nav-logo"
        style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
        onClick={() => onNav('services')}
      >
        <span className="nav-logo-mark">SD</span>
        <span className="nav-logo-name">Seoung-do</span>
      </button>

      <div className="nav-links">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`nav-link${active === t.id ? ' active' : ''}`}
            onClick={() => onNav(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="nav-right">
        <a
          href="https://github.com/seoungdo"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-outline"
        >
          <GitBranch size={14} />
          GitHub
        </a>
      </div>
    </nav>
  );
}
