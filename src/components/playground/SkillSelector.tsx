import { SKILLS, type Skill } from './skills';

interface SkillSelectorProps {
  selectedSkill: Skill | null;
  onSelect: (skill: Skill) => void;
}

const colorMap: Record<string, { border: string; bg: string; hover: string }> = {
  mint: {
    border: 'border-mint/40',
    bg: 'bg-mint/10',
    hover: 'hover:border-mint/60',
  },
  amber: {
    border: 'border-amber-400/40',
    bg: 'bg-amber-400/10',
    hover: 'hover:border-amber-400/60',
  },
  emerald: {
    border: 'border-emerald/40',
    bg: 'bg-emerald/10',
    hover: 'hover:border-emerald/60',
  },
};

export function SkillSelector({ selectedSkill, onSelect }: SkillSelectorProps) {
  return (
    <div className="flex gap-3 mb-6">
      {SKILLS.map((skill) => {
        const isSelected = selectedSkill?.id === skill.id;
        const colors = colorMap[skill.color];

        return (
          <button
            key={skill.id}
            onClick={() => onSelect(skill)}
            className={`flex-1 p-4 rounded-xl border text-left transition-all cursor-pointer ${
              isSelected
                ? `${colors.border} ${colors.bg} ring-1 ring-white/10`
                : `border-white/[0.08] bg-navy-mid ${colors.hover}`
            }`}
          >
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="text-lg">{skill.icon}</span>
              <span className={`text-sm font-semibold ${isSelected ? 'text-cream' : 'text-slate-light'}`}>
                {skill.name}
              </span>
            </div>
            <p className="text-xs text-slate leading-relaxed">{skill.description}</p>
          </button>
        );
      })}
    </div>
  );
}
