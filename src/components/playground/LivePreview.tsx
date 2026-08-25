import { useState, useEffect, useRef } from 'react';

interface LivePreviewProps {
  vmUrl?: string;
  vmStatus?: string;
}

export function LivePreview({ vmUrl, vmStatus }: LivePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (vmUrl) {
      setIsLoading(true);
      setError(null);
    }
  }, [vmUrl]);

  const handleRefresh = () => {
    if (iframeRef.current && vmUrl) {
      setIsLoading(true);
      setError(null);
      iframeRef.current.src = vmUrl;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* URL bar */}
      <div className="h-10 border-b border-white/5 bg-surface-container/30 flex items-center px-3 gap-2 shrink-0">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            vmStatus === 'running' ? 'bg-emerald-500' :
            vmStatus === 'creating' ? 'bg-amber-500' :
            'bg-tertiary/30'
          }`} />
          <span className="font-mono text-[11px] text-tertiary/60 truncate">
            {vmUrl || 'No preview'}
          </span>
        </div>
        {vmUrl && (
          <button
            onClick={handleRefresh}
            className="text-tertiary/40 hover:text-primary transition-colors p-1"
            title="Refresh"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        )}
      </div>

      {/* Preview content */}
      <div className="flex-1 relative bg-white">
        {isLoading && vmUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container/30 z-10">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="font-label-mono text-[10px] text-tertiary/50">Loading preview...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-container/30 z-10">
            <div className="text-center">
              <p className="text-sm text-tertiary/60 mb-2">Failed to load preview</p>
              <button
                onClick={handleRefresh}
                className="text-xs text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {vmUrl ? (
          <iframe
            ref={iframeRef}
            src={vmUrl}
            className="w-full h-full border-0"
            title="VM Preview"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setError('Preview unavailable');
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-3xl mb-3 opacity-20">👁️</div>
              <p className="font-label-mono text-[11px] text-tertiary/40">No preview available</p>
              <p className="font-label-mono text-[10px] text-tertiary/30 mt-1">
                Start a dev server to see your app here
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
