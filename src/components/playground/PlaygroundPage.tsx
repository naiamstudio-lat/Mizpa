import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAuthModal } from '../../hooks/useAuthModal';
import { SkillSelector } from './SkillSelector';
import { ChatInterface } from './ChatInterface';
import { SKILLS, type Skill } from './skills';

export function PlaygroundPage() {
  const [searchParams] = useSearchParams();
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const { user, signOut } = useAuth();
  const { open: openAuth } = useAuthModal();

  // Pre-select skill from query params
  useEffect(() => {
    const skillId = searchParams.get('skill');
    if (skillId) {
      const skill = SKILLS.find(s => s.id === skillId);
      if (skill) setSelectedSkill(skill);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <nav className="flex justify-between items-center px-margin-mobile md:px-margin-desktop py-grid-unit w-full max-w-container-max mx-auto h-20">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-3 no-underline">
              <span className="font-display-lg text-headline-sm tracking-tighter text-on-surface uppercase font-extrabold">
                Mizpa
              </span>
            </Link>
            <span className="font-label-mono text-label-mono text-primary/60 border border-primary/20 px-2 py-0.5">
              Playground
            </span>
          </div>

          <div className="flex items-center gap-6">
            {user ? (
              <>
                <span className="hidden md:inline font-label-mono text-label-mono text-tertiary">
                  {user.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="font-label-mono text-label-mono text-tertiary hover:text-primary transition-colors bg-transparent border-none cursor-pointer"
                >
                  Sign out
                </button>
              </>
            ) : (
              <button
                onClick={openAuth}
                className="bg-primary text-on-primary px-6 py-2 font-body-md font-bold rounded-lg hover:glow-primary transition-all duration-300 cursor-pointer border-none"
              >
                Sign in
              </button>
            )}
            <Link
              to="/"
              className="font-label-mono text-label-mono text-tertiary hover:text-primary transition-colors no-underline"
            >
              ← Home
            </Link>
          </div>
        </nav>
      </header>

      {/* Main */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-margin-mobile py-section-gap">
        {/* Title */}
        <div className="mb-8">
          <h1 className="font-headline-sm text-headline-sm text-on-surface mb-2">Playground</h1>
          <p className="font-label-mono text-label-mono text-tertiary">
            Choose a skill and test your Mizpa agents' capabilities.
          </p>
        </div>

        {/* Skill Selector */}
        <SkillSelector selectedSkill={selectedSkill} onSelect={setSelectedSkill} />

        {/* Chat Area */}
        <div className="flex-1 bg-surface-container border border-white/5 overflow-hidden flex flex-col min-h-[500px]">
          <ChatInterface skill={selectedSkill} />
        </div>

        {/* Footer hint */}
        <p className="font-label-mono text-[10px] text-tertiary/50 text-center mt-6">
          Tasks run on remote servers. Results may take a few minutes.
        </p>
      </div>
    </div>
  );
}
