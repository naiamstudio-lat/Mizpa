import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SkillSelector } from './SkillSelector';
import { ChatInterface } from './ChatInterface';
import { SKILLS, type Skill } from './skills';

export function PlaygroundPage() {
  const [searchParams] = useSearchParams();
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

  // Pre-select skill from query params
  useEffect(() => {
    const skillId = searchParams.get('skill');
    if (skillId) {
      const skill = SKILLS.find(s => s.id === skillId);
      if (skill) setSelectedSkill(skill);
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-navy flex flex-col">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link to="/" className="flex items-center gap-2.5 no-underline">
            <div className="w-8 h-8 bg-navy-mid rounded-lg flex items-center justify-center border border-mint/30">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="8" r="5.5" stroke="#6EE7B7" strokeWidth="1.2" />
                <path d="M7 8l2 2 4-4" stroke="#6EE7B7" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 15l4-2.5 4 2.5" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="10" y1="12.5" x2="10" y2="17" stroke="#94A3B8" strokeWidth="1" strokeLinecap="round" />
              </svg>
            </div>
            <span className="font-display text-lg font-bold text-cream">
              Miz<span className="text-mint">pa</span>
            </span>
          </Link>
          <span className="text-xs text-slate bg-white/[0.05] px-2 py-0.5 rounded-md">Playground</span>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm text-slate hover:text-cream transition-colors no-underline">
            Login
          </Link>
          <Link to="/" className="text-sm text-slate hover:text-cream transition-colors no-underline">
            ← Inicio
          </Link>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-6">
        {/* Title */}
        <div className="mb-6">
          <h1 className="font-display text-2xl font-bold text-cream mb-1">Playground</h1>
          <p className="text-sm text-slate">Elegí un skill y probá las capacidades de los agentes de Mizpa.</p>
        </div>

        {/* Skill Selector */}
        <SkillSelector selectedSkill={selectedSkill} onSelect={setSelectedSkill} />

        {/* Chat Area */}
        <div className="flex-1 bg-navy-mid border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col min-h-[500px]">
          <ChatInterface skill={selectedSkill} />
        </div>

        {/* Footer hint */}
        <p className="text-[11px] text-slate/50 text-center mt-4">
         (Mockup — las respuestas son simuladas. Los agentes reales se conectarán en la fase de implementación.)
        </p>
      </div>
    </div>
  );
}
