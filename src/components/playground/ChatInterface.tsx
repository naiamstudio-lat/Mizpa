import { useState, useRef, useEffect } from 'react';
import { ChatMessage, type Message } from './ChatMessage';
import { createTask, pollTaskStatus, getTaskResults } from '../../lib/api';
import { useAuth } from '../../hooks/useAuth';
import type { Skill } from './skills';

interface ChatInterfaceProps {
  skill: Skill | null;
}

const MOCK_RESPONSES: Record<string, string[]> = {
  replica: [
    '🔍 Analizando la estructura del sitio...\n\n✅ HTML parseado correctamente\n✅ Assets identificados (CSS, JS, imágenes)\n✅ Estructura de navegación mapeada\n\n⏳ Generando componentes React...\n\n🏗️ **Réplica en progreso:**\n- Navbar → `Navbar.tsx`\n- Hero → `Hero.tsx`\n- Features → `Features.tsx`\n- Footer → `Footer.tsx`\n\n✅ Réplica generada. 4 componentes, 12 archivos totales.\n📁 Salida: `output/replica/`',
    '🏗️ **Clonando sitio web**\n\nPaso 1/3: Descargando contenido HTML...\nPaso 2/3: Extrayendo design tokens (colores, tipografía, espaciado)...\nPaso 3/3: Generando arquitectura React + Tailwind...\n\n✅ **Réplica completada**\n- 6 componentes React generados\n- Estilos Tailwind extraídos del sitio original\n- Responsive design preserve\n- Listo para `npm run dev`',
  ],
  audit: [
    '🔍 **Auditoría SEO + GEO**\n\n📊 **Puntuación general: 42/100**\n\n🔴 **Críticos (3):**\n- Meta title ausente en 4 páginas\n- Imágenes sin alt text (12 de 18)\n- Velocidad de carga: 4.2s (objetivo: <2s)\n\n🟡 **Advertencias (5):**\n- Heading hierarchy rota (H1 → H3)\n- Schema markup incompleto\n- URLs con parámetros de tracking indexables\n- Sitemap.xml desactualizado (última actualización: 8 meses)\n- Meta description duplicada en 3 páginas\n\n🟢 **Pasados (4):**\n- SSL activo\n- Robots.txt configurado\n- canonical tags presentes\n- Mobile-friendly test aprobado\n\n💡 **GEO (Generative Engine Optimization):**\n- Estructura semántica: ⚠️ Mejorable\n- Contenido para citación por IA: ❌ No optimizado\n- Schema FAQ: ❌ Ausente\n- Featured snippets potential: ⚠️ Bajo',
    '🔍 **Análisis SEO completo**\n\n**Títulos y Meta:**\n- Title length: 28 chars (recomendado: 50-60)\n- Meta description: 0 de 8 páginas tienen description\n\n**Contenido:**\n- H1 tags: 3 duplicados, 2 ausentes\n- Thin content: 2 páginas con <300 palabras\n- Keywords principales: "servicios", "empresa", "contacto"\n\n**Técnico:**\n- Core Web Vitals: LCP 4.2s ❌ | FID 180ms ⚠️ | CLS 0.02 ✅\n- Broken links: 3 encontrados\n- Redirects: 2 cadenas de redirect\n\n**GEO (AI Optimization):**\n- Current AI visibility: Bajo\n- Recommended: Agregar schema FAQ, mejorar estructura semántica, crear sección "Preguntas frecuentes" con contenido rico para citación por ChatGPT/Perplexity.',
  ],
  generate: [
    '⚡ **Generador de Frontend Optimizado**\n\nFase 1/2: Auditoría del sitio actual...\n- SEO score: 42/100\n- Velocidad: 4.2s\n- Estructura: Mejorable\n\nFase 2/2: Generando réplica optimizada...\n\n✅ **Frontend generado:**\n\n📁 `output/optimized/`\n├── src/\n│   ├── components/\n│   │   ├── Navbar.tsx (optimizado)\n│   │   ├── Hero.tsx (mejorado)\n│   │   ├── Features.tsx\n│   │   ├── Testimonials.tsx\n│   │   └── Footer.tsx\n│   ├── styles/globals.css\n│   └── App.tsx\n├── public/\n├── package.json\n└── vite.config.ts\n\n🎯 **Mejoras aplicadas:**\n- Meta tags completos (title, description, OG tags)\n- Schema JSON-LD (Organization, FAQPage)\n- Imágenes optimizadas (WebP, lazy loading)\n- Core Web Vitals: LCP <2s, FID <100ms\n- SEO score proyectado: 85/100\n\n💡 **Siguiente paso:** Ejecutá `npm run dev` para previsualizar.',
  ],
};

function getMockResponse(skillId: string): string {
  const responses = MOCK_RESPONSES[skillId] || MOCK_RESPONSES['replica'];
  return responses[Math.floor(Math.random() * responses.length)];
}

export function ChatInterface({ skill }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset messages when skill changes
  useEffect(() => {
    if (skill) {
      const welcomeMessage = user
        ? `Hola! Soy Mizpa Agent. Seleccionaste: **${skill.name}**\n\n${skill.description}\n\nPegá una URL y arranco el análisis.`
        : `Hola! Soy Mizpa Agent. Seleccionaste: **${skill.name}**\n\n${skill.description}\n\n⚠️ Modo demo — sin autenticar. Pegá una URL para ver una respuesta simulada.\n\nPara usar los agentes reales, [iniciá sesión](/login).`;

      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: welcomeMessage,
          timestamp: new Date(),
          skillId: skill.id,
        },
      ]);
    }
  }, [skill, user]);

  const handleSend = async () => {
    if (!input.trim() || !skill) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    // If user is authenticated, use real API
    if (user) {
      try {
        // Create task via Edge Function
        const { taskId, vmId } = await createTask(skill.id, input.trim());

        // Add status message
        const statusMessage: Message = {
          id: `status-${Date.now()}`,
          role: 'assistant',
          content: `⏳ **Tarea creada**\n\n- Task ID: \`${taskId.slice(0, 8)}\`\n- VM: \`${vmId}\`\n- Skill: ${skill.name}\n\nIniciando agente...`,
          timestamp: new Date(),
          skillId: skill.id,
        };
        setMessages((prev) => [...prev, statusMessage]);

        // Poll for status (with timeout)
        try {
          const finalStatus = await pollTaskStatus(taskId, (status) => {
            console.log('Task status:', status.status);
          }, 2000, 30); // 30 attempts = 60 seconds max

          if (finalStatus.status === 'completed') {
            // Get results
            const results = await getTaskResults(taskId);

            const resultMessage: Message = {
              id: `result-${Date.now()}`,
              role: 'assistant',
              content: results.length > 0
                ? results.map(r => typeof r.content === 'string' ? r.content : JSON.stringify(r.content, null, 2)).join('\n\n')
                : '✅ Tarea completada. (Sin resultados detallados aún)',
              timestamp: new Date(),
              skillId: skill.id,
            };
            setMessages((prev) => [...prev, resultMessage]);
          } else {
            // Failed
            const errorMessage: Message = {
              id: `error-${Date.now()}`,
              role: 'assistant',
              content: `❌ **Tarea fallida**\n\n${finalStatus.error_message || 'Error desconocido'}`,
              timestamp: new Date(),
              skillId: skill.id,
            };
            setMessages((prev) => [...prev, errorMessage]);
          }
        } catch {
          // Polling timeout — show mock as fallback
          const fallbackMessage: Message = {
            id: `fallback-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ Timeout esperando resultados de la VM. Mostrando respuesta simulada:\n\n${getMockResponse(skill.id)}`,
            timestamp: new Date(),
            skillId: skill.id,
          };
          setMessages((prev) => [...prev, fallbackMessage]);
        }
      } catch (error) {
        // API error — show mock as fallback
        console.error('API error:', error);
        const errorMessage: Message = {
          id: `api-error-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Error conectando con el backend: ${error instanceof Error ? error.message : 'Unknown error'}\n\nMostrando respuesta simulada:\n\n${getMockResponse(skill.id)}`,
          timestamp: new Date(),
          skillId: skill.id,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } else {
      // Mock mode for unauthenticated users
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `📋 **Demo Mode** — respuesta simulada\n\n${getMockResponse(skill.id)}`,
        timestamp: new Date(),
        skillId: skill.id,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    }

    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!skill) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate text-sm">
        Seleccioná un skill para arrancar
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isTyping && (
          <div className="flex justify-start mb-4">
            <div className="bg-navy-mid border border-white/[0.08] px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-mint animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-mint animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-mint animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-white/[0.06]">
        <div className="flex gap-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={skill.promptPlaceholder}
            className="flex-1 bg-navy border border-white/10 text-cream px-4 py-3 rounded-xl text-sm font-sans outline-none transition-colors focus:border-mint placeholder:text-slate"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="bg-mint text-navy px-5 py-3 rounded-xl text-sm font-semibold font-sans transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}
