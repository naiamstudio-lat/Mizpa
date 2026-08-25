import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatMessage, type Message } from './ChatMessage';
import { createTask, pollTaskStatus, getTaskResults } from '../../lib/api';
import type { Skill } from './skills';

interface ChatInterfaceProps {
  skill: Skill | null;
}

const URL_REGEX = /^https?:\/\/.+\..+/i;

export function ChatInterface({ skill }: ChatInterfaceProps) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Reset messages when skill changes
  useEffect(() => {
    if (skill) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: t('chat.welcome', { skill: skill.name, description: skill.description }),
          timestamp: new Date(),
          skillId: skill.id,
        },
      ]);
    }
  }, [skill]);

  const handleSend = async () => {
    if (!input.trim() || !skill) return;

    let raw = input.trim();

    // Auto-prepend https:// if no protocol
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }

    // URL validation
    if (!URL_REGEX.test(raw)) {
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: t('chat.invalidUrl'),
        timestamp: new Date(),
        skillId: skill.id,
      };
      setMessages((prev) => [...prev, errorMsg]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: raw,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsTyping(true);

    try {
      console.log('Creating task for skill:', skill.id, 'url:', raw);
      const { taskId, vmId, status: initialStatus, message } = await createTask(skill.id, raw);
      console.log('Task created:', taskId, 'status:', initialStatus);

      // Status message: adapt to initial state
      const isQueued = initialStatus === 'queued' || !vmId;
      const statusContent = isQueued
        ? t('chat.taskQueued', { message: message || '' })
        : t('chat.taskCreated', { skill: skill.name, url: raw });

      const statusMsgId = `status-${Date.now()}`;
      const statusMessage: Message = {
        id: statusMsgId,
        role: 'assistant',
        content: statusContent,
        timestamp: new Date(),
        skillId: skill.id,
      };
      setMessages((prev) => [...prev, statusMessage]);

      // Poll — update status message on each change
      const finalStatus = await pollTaskStatus(taskId, (current) => {
        if (current.status === 'queued' || current.status === 'running' || current.status === 'pending') {
          const labelKey = `chat.status${current.status.charAt(0).toUpperCase() + current.status.slice(1)}`;
          const label = t(labelKey);
          if (label) {
            setMessages((prev) => {
              const updated = [...prev];
              const idx = updated.findIndex((m) => m.id === statusMsgId);
              if (idx !== -1) {
                updated[idx] = { ...updated[idx], content: `${label}\n\nURL: \`${raw}\`` };
              }
              return updated;
            });
          }
        }
      }, 2000, 150); // 150 attempts = 5 minutes max

      if (finalStatus.status === 'completed') {
        const results = await getTaskResults(taskId);

        // Replace status message with result
        const resultMessage: Message = {
          id: `result-${Date.now()}`,
          role: 'assistant',
          content: results.length > 0
            ? results.map(r => typeof r.content === 'string' ? r.content : JSON.stringify(r.content, null, 2)).join('\n\n')
            : t('chat.taskCompleted'),
          timestamp: new Date(),
          skillId: skill.id,
        };
        setMessages((prev) => [...prev, resultMessage]);
      } else if (finalStatus.status === 'failed') {
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: t('chat.taskFailed', { error: finalStatus.error_message || 'Unknown error' }),
          timestamp: new Date(),
          skillId: skill.id,
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Error:', error);

      const timedOut = error instanceof Error && error.message === 'Task polling timeout';
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: timedOut
          ? t('chat.timeout')
          : t('chat.error', { message: error instanceof Error ? error.message : 'Unknown error' }),
        timestamp: new Date(),
        skillId: skill.id,
      };
      setMessages((prev) => [...prev, errorMessage]);
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
      <div className="flex-1 flex items-center justify-center text-tertiary font-label-mono text-label-mono">
        {t('chat.selectSkill')}
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
            <div className="bg-surface-container border border-white/5 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
        <div className="p-4 border-t border-white/5">
        <div className="flex gap-2.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholderUrl')}
            className="flex-1 bg-background border border-white/10 text-on-surface px-4 py-3 font-body-md text-body-md outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary/20 placeholder:text-outline-variant"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className="bg-primary text-on-primary px-5 py-3 font-body-md font-bold rounded-lg transition-all duration-300 hover:glow-primary disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap border-none cursor-pointer"
          >
            {t('chat.send')}
          </button>
        </div>
      </div>
    </div>
  );
}
