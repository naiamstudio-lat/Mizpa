import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { listLabVMs, getVMStatus, createLabVM, deleteLabVM, type LabVM, type VMStatus } from '../../lib/freestyle-api';

interface ProjectPanelProps {
  selectedVM?: LabVM | null;
  onVMSelect?: (vm: LabVM) => void;
  onVMCreated?: (vm: LabVM) => void;
}

export function ProjectPanel({ selectedVM, onVMSelect, onVMCreated }: ProjectPanelProps) {
  const { user } = useAuth();
  const [vms, setVms] = useState<LabVM[]>([]);
  const [vmStatusMap, setVmStatusMap] = useState<Record<string, VMStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchVMs = async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    
    try {
      const allVMs = await listLabVMs();
      setVms(allVMs);
      
      const statusPromises = allVMs.map(async (vm) => {
        try {
          const status = await getVMStatus(vm.vmId);
          return { vmId: vm.vmId, status };
        } catch (err) {
          console.error(`Failed to fetch status for VM ${vm.vmId}:`, err);
          return { vmId: vm.vmId, status: { vmId: vm.vmId, status: 'error' as const, createdAt: vm.createdAt } as VMStatus };
        }
      });
      
      const statuses = await Promise.all(statusPromises);
      const statusMap = statuses.reduce((acc, { vmId, status }) => {
        acc[vmId] = status;
        return acc;
      }, {} as Record<string, VMStatus>);
      
      setVmStatusMap(statusMap);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load VMs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateVM = async () => {
    if (!user) return;
    setIsCreating(true);
    setError(null);
    
    try {
      const result = await createLabVM();
      const newVM: LabVM = {
        vmId: result.vmId,
        publicUrl: result.publicUrl,
        status: 'running',
        createdAt: new Date().toISOString(),
      };
      await fetchVMs();
      onVMCreated?.(newVM);
      onVMSelect?.(newVM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create VM');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteVM = async (vmId: string) => {
    if (!confirm(`Are you sure you want to delete VM ${vmId}? This cannot be undone.`)) {
      return;
    }
    
    try {
      await deleteLabVM(vmId);
      setVms(prev => prev.filter(vm => vm.vmId !== vmId));
      setVmStatusMap(prev => {
        const newMap = { ...prev };
        delete newMap[vmId];
        return newMap;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete VM');
      await fetchVMs();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'bg-green-500';
      case 'creating': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      case 'idle': return 'bg-gray-500';
      case 'stopped': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running': return 'Running';
      case 'creating': return 'Creating';
      case 'error': return 'Error';
      case 'idle': return 'Idle';
      case 'stopped': return 'Stopped';
      default: return 'Unknown';
    }
  };

  useEffect(() => {
    fetchVMs();
  }, [user]);

  return (
    <div className="flex flex-col h-full p-4">
      <div className="mb-4">
        <h3 className="font-headline-sm text-headline-sm text-on-surface mb-2">📁 Your VMs</h3>
        <p className="font-label-mono text-label-mono text-tertiary text-sm">
          Manage your freestyle.sh VMs and deployed projects
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4">
          <div className="font-label-mono text-label-mono text-sm text-red-400">
            ⚠️ {error}
          </div>
        </div>
      )}

      <button
        onClick={handleCreateVM}
        disabled={isCreating || isLoading}
        className="w-full bg-primary text-on-primary px-4 py-3 font-label-mono text-label-mono rounded-lg hover:glow-primary transition-all mb-4 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border-none"
      >
        {isCreating ? 'Creating VM...' : '🚀 Create New VM'}
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : vms.length === 0 ? (
        <div className="text-center py-8">
          <div className="text-4xl mb-4">🖥️</div>
          <div className="font-label-mono text-label-mono text-sm text-tertiary">
            No VMs found
          </div>
          <div className="font-label-mono text-label-mono text-xs text-tertiary/70 mt-1">
            Create your first VM to start building!
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {vms.map((vm) => {
            const status = vmStatusMap[vm.vmId];
            const isSelected = selectedVM?.vmId === vm.vmId;
            
            return (
              <div
                key={vm.vmId}
                className={`bg-surface-container border rounded-lg p-4 transition-all cursor-pointer hover:scale-[1.02] ${isSelected ? 'border-primary bg-primary/10 ring-1 ring-primary/30' : 'border-white/5 hover:border-white/20'}`}
                onClick={() => onVMSelect?.(vm)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(status?.status || vm.status)}`} />
                    <span className="font-label-mono text-label-mono text-sm font-bold">
                      {vm.vmId}
                    </span>
                    {isSelected && (
                      <span className="bg-primary text-on-primary px-2 py-0.5 font-label-mono text-label-mono text-xs rounded">
                        SELECTED
                      </span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteVM(vm.vmId);
                    }}
                    className="text-tertiary hover:text-red-400 transition-colors"
                    title="Delete VM"
                  >
                    🗑️
                  </button>
                </div>
                
                <div className="space-y-1">
                  {vm.publicUrl && (
                    <div className="font-label-mono text-label-mono text-xs text-tertiary">
                      📱 {vm.publicUrl}
                    </div>
                  )}
                  <div className="font-label-mono text-label-mono text-xs text-tertiary/70">
                    Created: {new Date(vm.createdAt).toLocaleDateString()} {new Date(vm.createdAt).toLocaleTimeString()}
                  </div>
                  {status?.status && (
                    <div className="font-label-mono text-label-mono text-xs">
                      Status: <span className={getStatusColor(status.status).replace('bg-', 'text-')}>{getStatusText(status.status)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-white/5">
        <div className="font-label-mono text-label-mono text-xs text-tertiary">
          💡 Tip: Use the Lab Chat to create VMs and run commands like "npm start" to deploy apps
        </div>
      </div>
    </div>
  );
}