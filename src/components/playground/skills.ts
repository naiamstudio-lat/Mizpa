export interface Skill {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  promptPlaceholder: string;
}

export const SKILLS: Skill[] = [
  {
    id: 'replica',
    name: 'Réplica de Sitio',
    description: 'Cloná un sitio web y generá una réplica optimizada en React + Tailwind.',
    icon: '🏗️',
    color: 'mint',
    promptPlaceholder: 'Pegá la URL del sitio que querés clonar...',
  },
  {
    id: 'audit',
    name: 'Auditoría SEO + GEO',
    description: 'Analizá un sitio para detectar problemas de SEO y optimización para motores de búsqueda generativos.',
    icon: '🔍',
    color: 'amber',
    promptPlaceholder: 'Pegá la URL del sitio a auditar...',
  },
  {
    id: 'generate',
    name: 'Generar Frontend Optimizado',
    description: 'Combiná auditoría + réplica: analizá el sitio y generá una versión mejorada lista para deploy.',
    icon: '⚡',
    color: 'emerald',
    promptPlaceholder: 'Pegá la URL del sitio a optimizar...',
  },
];
