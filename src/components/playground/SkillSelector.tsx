import { SKILLS, type Skill } from './skills';

interface SkillSelectorProps {
  selectedSkill: Skill | null;
  onSelect: (skill: Skill) => void;
}

const colorMap: Record<string, { border: string; bg: string; hover: string }> = {
  mint: {
    border: 'border-primary/40',
    bg: 'bg-primary/5',
    hover: 'hover:border-primary/40',
  },
  amber: {
    border: 'border-primary/30',
    bg: 'bg-primary/5',
    hover: 'hover:border-primary/30',
  },
  emerald: {
    border: 'border-primary/20',
    bg: 'bg-primary/5',
    hover: 'hover:border-primary/20',
  },
};

export function SkillSelector({ selectedSkill, onSelect }: SkillSelectorProps) {
  return (
    <div className="flex gap-3 mb-8">
      {SKILLS.map((skill) => {
        const isSelected = selectedSkill?.id === skill.id;
        const colors = colorMap[skill.color];

        return (
          <button
            key={skill.id}
            onClick={() => onSelect(skill)}
            className={`flex-1 p-5 border text-left transition-all duration-300 cursor-pointer ${
              isSelected
                ? `${colors.border} ${colors.bg}`
                : 'border-white/5 bg-surface-container/20 hover:border-white/20'
            }`}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-lg">{skill.icon}</span>
              <span className={`font-body-md text-body-md font-bold ${isSelected ? 'text-on-surface' : 'text-tertiary'}`}>
                {skill.name}
              </span>
            </div>
            <p className="font-label-mono text-label-mono text-tertiary leading-relaxed">{skill.description}</p>
          </button>
        );
      })}
    </div>
  );
}
