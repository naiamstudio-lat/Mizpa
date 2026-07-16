export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  skillId?: string;
}

interface ChatMessageProps {
  message: Message;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] px-4 py-3 leading-relaxed ${
          isUser
            ? 'bg-primary text-on-primary rounded-lg rounded-br-sm'
            : 'bg-surface-container border border-white/5 text-on-surface rounded-lg rounded-bl-sm'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-2">
            <span className="font-label-mono text-[10px] uppercase tracking-widest text-primary">Mizpa Agent</span>
          </div>
        )}
        <div className="font-body-md text-body-md whitespace-pre-wrap">{message.content}</div>
        <div className={`font-label-mono text-[10px] mt-2 ${isUser ? 'text-on-primary/60' : 'text-tertiary/60'}`}>
          {message.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
