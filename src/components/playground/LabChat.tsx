import { useState, useRef, useEffect } from 'react';
import { createLabVM, execVMCommand, type LabVM } from '../../lib/freestyle-api';

interface LabChatProps {
  vm?: LabVM | null;
  onVMCreated?: (vm: LabVM) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

const PROJECT_PRESETS = [
  { id: 'vite', name: 'Vite (React/Vue/Svelte)', port: 5173, icon: '⚡' },
  { id: 'nextjs', name: 'Next.js', port: 3000, icon: '▲' },
  { id: 'react', name: 'React (CRA)', port: 3000, icon: '⚛️' },
  { id: 'vue', name: 'Vue CLI', port: 8080, icon: '💚' },
  { id: 'svelte', name: 'SvelteKit', port: 5173, icon: '🔥' },
  { id: 'custom', name: 'Custom port', port: 5173, icon: '⚙️' },
];

export function LabChat({ vm, onVMCreated }: LabChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentVM, setCurrentVM] = useState<LabVM | null>(vm || null);
  const [isCreatingVM, setIsCreatingVM] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(PROJECT_PRESETS[0]);
  const [customPort, setCustomPort] = useState('5173');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: vm
          ? `Connected to VM \`${vm.vmId}\`. Ready for commands.`
          : 'What do you want to build? Create a VM to get started.',
        timestamp: new Date(),
      }]);
    }
  }, []);

  // Sync VM prop
  useEffect(() => {
    if (vm && vm.vmId !== currentVM?.vmId) {
      setCurrentVM(vm);
      setMessages(prev => [...prev, {
        id: 'vm-connected-' + Date.now(),
        role: 'system',
        content: `VM \`${vm.vmId}\` connected. Live at ${vm.publicUrl}`,
        timestamp: new Date(),
      }]);
    }
  }, [vm]);

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

  const handleCreateVM = async () => {
    setIsCreatingVM(true);
    try {
      const previewPort = selectedPreset.id === 'custom' 
        ? parseInt(customPort) || 5173 
        : selectedPreset.port;
      
      const result = await createLabVM({ previewPort });
      const newVM: LabVM = {
        vmId: result.vmId,
        publicUrl: result.publicUrl,
        previewUrl: result.previewUrl,
        status: 'running',
        createdAt: new Date().toISOString(),
      };
      setCurrentVM(newVM);
      onVMCreated?.(newVM);
      setMessages(prev => [...prev, {
        id: 'vm-created-' + Date.now(),
        role: 'assistant',
        content: result.previewUrl
          ? `Created VM \`${newVM.vmId}\` for ${selectedPreset.name}.\n\nPreview at: ${result.previewUrl} (port ${previewPort})\n\nTry running: \`${selectedPreset.id === 'nextjs' ? 'npx create-next-app@latest' : 'npm init'}\`, then \`${selectedPreset.id === 'nextjs' ? 'npm run dev' : 'npm start'}\``
          : `Created VM \`${newVM.vmId}\` for ${selectedPreset.name}.\n\nLive at: ${newVM.publicUrl}\n\nTry running: \`${selectedPreset.id === 'nextjs' ? 'npx create-next-app@latest' : 'npm init'}\`, then \`${selectedPreset.id === 'nextjs' ? 'npm run dev' : 'npm start'}\``,
        timestamp: new Date(),
      }]);
    } catch (error) {
      setMessages(prev => [...prev, {
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: `Failed to create VM: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsCreatingVM(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !currentVM) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const result = await execVMCommand(currentVM.vmId, userMsg.content);
      
      let output = '';
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += (output ? '\n' : '') + result.stderr;
      if (!output) output = `Exit code: ${result.statusCode}`;

      setMessages(prev => [...prev, {
        id: 'result-' + Date.now(),
        role: 'assistant',
        content: output,
        timestamp: new Date(),
      }]);

      // Check if it's a dev server command
      if (userMsg.content.match(/npm start|serve|vite|next dev|python.*http/)) {
        setMessages(prev => [...prev, {
          id: 'preview-hint-' + Date.now(),
          role: 'system',
          content: 'App should be running. Check the preview panel.',
          timestamp: new Date(),
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, {
        id: 'error-' + Date.now(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Command failed'}`,
        timestamp: new Date(),
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

  const formatContent = (content: string) => {
    // Simple code block detection
    return content.split('\n').map((line, i) => {
      if (line.startsWith('$ ')) {
        return <div key={i} className="font-mono text-primary text-sm">{line}</div>;
      }
      if (line.match(/^(npm|git|node|yarn|pnpm|bun|npx|serve|python)/)) {
        return <div key={i} className="font-mono text-primary/80 text-sm">{line}</div>;
      }
      return <div key={i}>{line}</div>;
    });
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {messages.length === 0 && !currentVM ? (
          // Welcome screen with project selector
          <div className="flex flex-col items-center justify-center h-full gap-6 text-center max-w-md mx-auto">
            <div className="text-4xl">🧪</div>
            <div>
              <h2 className="text-xl font-semibold text-on-surface mb-2">What do you want to build?</h2>
              <p className="text-sm text-tertiary">Select your project type and create a VM</p>
            </div>
            
            {/* Project type selector */}
            <div className="w-full grid grid-cols-2 gap-2">
              {PROJECT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPreset(preset)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-left transition-all border cursor-pointer ${
                    selectedPreset.id === preset.id
                      ? 'bg-primary/10 border-primary/30 text-on-surface'
                      : 'bg-surface-container border-white/5 text-tertiary hover:border-white/10 hover:text-on-surface'
                  }`}
                >
                  <span className="text-lg">{preset.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-label-mono text-xs truncate">{preset.name}</div>
                    <div className="font-label-mono text-[10px] text-tertiary/60">:{preset.port}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom port input */}
            {selectedPreset.id === 'custom' && (
              <div className="w-full flex items-center gap-2">
                <span className="font-label-mono text-xs text-tertiary">Port:</span>
                <input
                  type="number"
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                  className="flex-1 bg-surface-container border border-white/10 rounded-lg px-3 py-2 font-mono text-sm text-on-surface outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                  placeholder="5173"
                  min="1"
                  max="65535"
                />
              </div>
            )}

            <button
              onClick={handleCreateVM}
              disabled={isCreatingVM}
              className="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-label-mono text-sm hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer border-none"
            >
              {isCreatingVM ? 'Creating...' : `Create ${selectedPreset.name} VM`}
            </button>
          </div>
        ) : (
          // Messages
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'system' ? (
                  <div className="w-full text-center">
                    <span className="font-label-mono text-[11px] text-tertiary/60 bg-surface-container px-3 py-1 rounded-full">
                      {msg.content}
                    </span>
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
                      <div className="whitespace-pre-wrap">{formatContent(msg.content)}</div>
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
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-white/5 p-4 bg-background">
        <div className="max-w-3xl mx-auto">
          {currentVM ? (
            <div className="relative flex items-end gap-2 bg-surface-container border border-white/10 rounded-2xl px-4 py-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Send a message..."
                rows={1}
                className="flex-1 bg-transparent text-on-surface text-sm outline-none resize-none py-1.5 placeholder:text-tertiary/50 max-h-[120px]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping}
                className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer border-none shrink-0 mb-0.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5" />
                  <polyline points="5 12 12 5 19 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-surface-container border border-white/10 rounded-2xl px-4 py-3 text-sm text-tertiary/50">
                Create a VM first to start chatting
              </div>
              <button
                onClick={handleCreateVM}
                disabled={isCreatingVM}
                className="bg-primary text-on-primary px-5 py-2.5 rounded-2xl font-label-mono text-sm hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer border-none"
              >
                {isCreatingVM ? '...' : 'New VM'}
              </button>
            </div>
          )}
          <div className="mt-2 text-center">
            <span className="font-label-mono text-[10px] text-tertiary/30">
              {currentVM ? `VM: ${currentVM.vmId} · Commands run on freestyle.sh` : 'Powered by freestyle.sh'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
