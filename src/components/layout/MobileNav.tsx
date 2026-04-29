import { Grid3x3, TrendingUp, BookOpen, Play, FolderOpen, Activity } from 'lucide-react';
import type { TabId } from '../../types/dashboard';

interface Props {
  active: TabId;
  onNav: (tab: TabId) => void;
}

const TABS = [
  { id: 'services' as TabId, label: '서비스', Icon: Grid3x3 },
  { id: 'trends' as TabId, label: 'AI 트렌드', Icon: TrendingUp },
  { id: 'lectures' as TabId, label: '강의', Icon: BookOpen },
  { id: 'youtube' as TabId, label: '유튜브', Icon: Play },
  { id: 'projects' as TabId, label: '프로젝트', Icon: FolderOpen },
  { id: 'orchestrator' as TabId, label: '오케스트레이터', Icon: Activity },
];

export default function MobileNav({ active, onNav }: Props) {
  return (
    <nav className="mobile-bottom-nav">
      <div className="mobile-bottom-nav-inner">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`mobile-nav-btn${active === id ? ' active' : ''}`}
            onClick={() => onNav(id)}
          >
            <Icon size={20} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
