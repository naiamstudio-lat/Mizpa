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
        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-mint text-navy rounded-br-md'
            : 'bg-navy-mid border border-white/[0.08] text-slate-light rounded-bl-md'
        }`}
      >
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[10px] font-medium tracking-wider uppercase text-mint">Mizpa Agent</span>
          </div>
        )}
        <div className="whitespace-pre-wrap">{message.content}</div>
        <div className={`text-[10px] mt-1.5 ${isUser ? 'text-navy/50' : 'text-slate/50'}`}>
          {message.timestamp.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
