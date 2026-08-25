import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { useAuthModal } from '../../hooks/useAuthModal';
import { SkillSelector } from './SkillSelector';
import { ChatInterface } from './ChatInterface';
import { LabChat } from './LabChat';
import { DeployChat } from './DeployChat';
import { DeploySiteCreator } from './DeploySiteCreator';
import { LivePreview } from './LivePreview';
import { ProjectSidebar } from './ProjectSidebar';
import { SKILLS, type Skill } from './skills';
import type { LabVM } from '../../lib/freestyle-api';

export type PlaygroundMode = 'skills' | 'lab' | 'deploy';

export function PlaygroundPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [mode, setMode] = useState<PlaygroundMode>('deploy');
  const [selectedVM, setSelectedVM] = useState<LabVM | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [currentSiteId, setCurrentSiteId] = useState<string | null>(null);
  const [currentSiteName, setCurrentSiteName] = useState<string>('');
  const { user, signOut } = useAuth();
  const { open: openAuth } = useAuthModal();

  useEffect(() => {
    const skillId = searchParams.get('skill');
    if (skillId) {
      const skill = SKILLS.find(s => s.id === skillId);
      if (skill) setSelectedSkill(skill);
    }
    const siteId = searchParams.get('site');
    if (siteId) {
      setCurrentSiteId(siteId);
      setMode('deploy');
    }
    const hash = window.location.hash.replace('#', '') as PlaygroundMode;
    if (hash === 'lab' || hash === 'skills' || hash === 'deploy') {
      setMode(hash);
    }
  }, [searchParams]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as PlaygroundMode;
      if (hash === 'skills' || hash === 'lab' || hash === 'deploy') {
        setMode(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleModeChange = (newMode: PlaygroundMode) => {
    setMode(newMode);
    window.location.hash = newMode;
  };

  const handleVMSelect = useCallback((vm: LabVM) => {
    setSelectedVM(vm);
  }, []);

  const handleVMCreated = useCallback((vm: LabVM) => {
    setSelectedVM(vm);
  }, []);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-12 border-b border-white/5 bg-background/80 backdrop-blur-xl flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-2 no-underline">
            <span className="font-display-lg text-sm tracking-tighter text-on-surface uppercase font-extrabold">
              Mizpa
            </span>
          </Link>
          <span className="font-label-mono text-[10px] text-primary/60 border border-primary/20 px-1.5 py-0.5">
            {mode === 'lab' ? 'LAB' : 'SKILLS'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex items-center bg-surface-container rounded-lg p-0.5">
            <button
              onClick={() => handleModeChange('deploy')}
              className={`px-3 py-1 font-label-mono text-[11px] rounded-md transition-all bg-transparent border-none cursor-pointer ${
                mode === 'deploy' ? 'bg-primary text-on-primary' : 'text-tertiary hover:text-on-surface'
              }`}
            >
              Deploy
            </button>
            <button
              onClick={() => handleModeChange('skills')}
              className={`px-3 py-1 font-label-mono text-[11px] rounded-md transition-all bg-transparent border-none cursor-pointer ${
                mode === 'skills' ? 'bg-primary text-on-primary' : 'text-tertiary hover:text-on-surface'
              }`}
            >
              Skills
            </button>
            <button
              onClick={() => handleModeChange('lab')}
              className={`px-3 py-1 font-label-mono text-[11px] rounded-md transition-all bg-transparent border-none cursor-pointer ${
                mode === 'lab' ? 'bg-primary text-on-primary' : 'text-tertiary hover:text-on-surface'
              }`}
            >
              Lab
            </button>
          </div>

          {selectedVM && mode === 'lab' && (
            <button
              onClick={() => setShowPreview(!showPreview)}
              className={`px-3 py-1 font-label-mono text-[11px] rounded-lg transition-all bg-transparent border cursor-pointer ${
                showPreview ? 'border-primary text-primary' : 'border-white/10 text-tertiary hover:text-on-surface'
              }`}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
          )}

          {user ? (
            <>
              <span className="hidden md:inline font-label-mono text-[11px] text-tertiary">
                {user.email}
              </span>
              <button
                onClick={() => signOut()}
                className="font-label-mono text-[11px] text-tertiary hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              onClick={openAuth}
              className="bg-primary text-on-primary px-4 py-1 font-label-mono text-[11px] rounded-lg hover:opacity-90 transition-all cursor-pointer border-none"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      {mode === 'deploy' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Deploy Chat */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {currentSiteId ? (
              <DeployChat 
                siteId={currentSiteId} 
                siteName={currentSiteName || 'Mi Sitio'}
                previewUrl={`https://${currentSiteName || 'mi-sitio'}.pages.dev`}
              />
            ) : (
              <DeploySiteCreator onSiteCreated={(site: { id: string; name: string }) => {
                setCurrentSiteId(site.id);
                setCurrentSiteName(site.name);
              }} />
            )}
          </div>
        </div>
      ) : mode === 'skills' ? (
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-12">
            <div className="mb-8">
              <h1 className="font-headline-sm text-headline-sm text-on-surface mb-2">{t('playground.title')}</h1>
              <p className="font-label-mono text-label-mono text-tertiary">{t('playground.description')}</p>
            </div>
            <SkillSelector selectedSkill={selectedSkill} onSelect={setSelectedSkill} />
            <div className="bg-surface-container border border-white/5 overflow-hidden flex flex-col min-h-[500px]">
              <ChatInterface skill={selectedSkill} />
            </div>
            <p className="font-label-mono text-[10px] text-tertiary/50 text-center mt-6">{t('playground.tasksHint')}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar - Projects */}
          <aside className="w-72 border-r border-white/5 bg-surface-container-low flex flex-col shrink-0">
            <ProjectSidebar
              selectedVM={selectedVM}
              onVMSelect={handleVMSelect}
              onVMCreated={handleVMCreated}
            />
          </aside>

          {/* Central area - Chat + optional Preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {showPreview && selectedVM ? (
              <div className="flex-1 flex overflow-hidden">
                {/* Chat */}
                <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5">
                  <LabChat vm={selectedVM} onVMCreated={handleVMCreated} />
                </div>
                {/* Preview */}
                <div className="w-1/2 flex flex-col overflow-hidden">
                  <LivePreview vmUrl={selectedVM.previewUrl || selectedVM.publicUrl} vmStatus={selectedVM.status} />
                </div>
              </div>
            ) : (
              <LabChat vm={selectedVM} onVMCreated={handleVMCreated} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
