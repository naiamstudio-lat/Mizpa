import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface DeployChatProps {
  siteId: string;
  siteName: string;
  previewUrl?: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: string;
}

interface AgentConfig {
  vmUrl: string;
  apiKey: string;
  model: string;
}

export function DeployChat({ siteId, siteName }: DeployChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null);
  const [vmStatus, setVmStatus] = useState<'connecting' | 'ready' | 'error'>('connecting');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Connect to VM and get Agent Server preview domain
  useEffect(() => {
    let mounted = true;

    const connectToVm = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const res = await fetch(`${SUPABASE_URL}/functions/v1/run-agent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
          },
          body: JSON.stringify({ site_id: siteId })
        });

        if (!res.ok) throw new Error('Failed to connect to VM');

        const data = await res.json();
        
        if (mounted) {
          setAgentConfig({
            vmUrl: data.vmUrl,
            apiKey: data.apiKey,
            model: data.model
          });
          setVmStatus('ready');
          
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: `🚀 Agente conectado. Listo para crear.`,
            timestamp: new Date()
          }]);
        }
      } catch (err) {
        console.error('[DeployChat] VM connection error:', err);
        if (mounted) {
          setVmStatus('error');
          setMessages([{
            id: 'error',
            role: 'assistant',
            content: '❌ Error conectando al agente. Reintentando...',
            timestamp: new Date()
          }]);
        }
      }
    };

    connectToVm();
    return () => { mounted = false; };
  }, [siteId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const handleSend = async () => {
    if (!input.trim() || isTyping || !agentConfig) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setMessages(prev => [...prev, {
      id: `processing-${Date.now()}`,
      role: 'system',
      content: '⚡ Procesando...',
      timestamp: new Date(),
      status: 'processing'
    }]);

    try {
      // Call Agent Server /chat endpoint (no auth needed)
      const response = await fetch(`${agentConfig.vmUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMsg.content
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API returned ${response.status}: ${errText}`);
      }

      const result = await response.json();
      const assistantContent = result.response || '✅ Tarea completada.';

      setMessages(prev => prev.filter(m => m.status !== 'processing'));
      setMessages(prev => [...prev, {
        id: `response-${Date.now()}`,
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
        status: 'completed'
      }]);

    } catch (error) {
      console.error('[DeployChat] Error:', error);
      setMessages(prev => prev.filter(m => m.status !== 'processing'));
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `❌ Error: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        timestamp: new Date(),
        status: 'failed'
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          vmStatus === 'ready' ? 'bg-green-500' :
          vmStatus === 'connecting' ? 'bg-yellow-500' :
          'bg-red-500'
        }`} />
        <span className="font-label-mono text-[10px] text-tertiary">
          {siteName} · {vmStatus === 'ready' ? 'Agente listo' : vmStatus === 'connecting' ? 'Conectando...' : 'Error'}
        </span>
        {agentConfig && (
          <span className="ml-auto font-label-mono text-[9px] text-tertiary/40">
            Hermes Agent · {agentConfig.model}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'system' ? (
                <div className="w-full text-center">
                  {msg.status === 'processing' ? (
                    <span className="font-label-mono text-[11px] bg-surface-container px-3 py-1 rounded-full text-primary">
                      {msg.content}
                    </span>
                  ) : (
                    <span className={`font-label-mono text-[11px] bg-surface-container px-3 py-1 rounded-full ${
                      msg.status === 'completed' ? 'text-green-500' :
                      msg.status === 'failed' ? 'text-red-500' :
                      'text-tertiary/60'
                    }`}>
                      {msg.content}
                    </span>
                  )}
                </div>
              ) : (
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                  {msg.role === 'assistant' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-[10px] text-primary font-bold">M</span>
                      </div>
                      <span className="font-label-mono text-[10px] text-tertiary/60 uppercase tracking-wider">Agent</span>
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-on-primary rounded-br-sm'
                      : 'bg-surface-container border border-white/5 text-on-surface rounded-bl-sm'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  <div className="font-label-mono text-[10px] text-tertiary/40 mt-1 px-1">
                    {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="max-w-[85%]">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-[10px] text-primary font-bold">M</span>
                  </div>
                  <span className="font-label-mono text-[10px] text-tertiary/60 uppercase tracking-wider">Agent</span>
                </div>
                <div className="bg-surface-container border border-white/5 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-white/5 p-4 bg-background">
        <div className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-surface-container border border-white/10 rounded-2xl px-4 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={vmStatus === 'ready' ? "Describe lo que quieres crear..." : "Conectando..."}
              rows={1}
              disabled={vmStatus !== 'ready'}
              className="flex-1 bg-transparent text-on-surface text-sm outline-none resize-none py-1.5 placeholder:text-tertiary/50 max-h-[120px] disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping || vmStatus !== 'ready'}
              className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer border-none shrink-0 mb-0.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
          <div className="mt-2 text-center">
            <span className="font-label-mono text-[10px] text-tertiary/30">
              {siteName} · Powered by Hermes + Freestyle VM
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
