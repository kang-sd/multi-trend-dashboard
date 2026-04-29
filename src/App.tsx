import { useState } from 'react';
import TopNav from './components/layout/TopNav';
import MobileNav from './components/layout/MobileNav';
import ServicesTab from './components/tabs/ServicesTab';
import RadarTab from './components/tabs/RadarTab';
import LectureTab from './components/tabs/LectureTab';
import YoutubeTab from './components/tabs/YoutubeTab';
import ProjectsTab from './components/tabs/ProjectsTab';
import OrchestratorTab from './components/tabs/OrchestratorTab';
import type { TabId } from './types/dashboard';

export default function App() {
  const [tab, setTab] = useState<TabId>('services');

  return (
    <>
      <TopNav active={tab} onNav={setTab} />
      <main className="page-main">
        {tab === 'services' && <ServicesTab />}
        {tab === 'trends' && <RadarTab />}
        {tab === 'lectures' && <LectureTab />}
        {tab === 'youtube' && <YoutubeTab onNavigate={setTab} />}
        {tab === 'projects' && <ProjectsTab />}
        {tab === 'orchestrator' && <OrchestratorTab />}
      </main>
      <MobileNav active={tab} onNav={setTab} />
    </>
  );
}
