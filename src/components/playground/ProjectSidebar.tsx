import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { listLabVMs, getVMStatus, createLabVM, deleteLabVM, type LabVM, type VMStatus } from '../../lib/freestyle-api';

interface ProjectSidebarProps {
  selectedVM?: LabVM | null;
  onVMSelect?: (vm: LabVM) => void;
  onVMCreated?: (vm: LabVM) => void;
}

export function ProjectSidebar({ selectedVM, onVMSelect, onVMCreated }: ProjectSidebarProps) {
  const { user } = useAuth();
  const [vms, setVms] = useState<LabVM[]>([]);
  const [vmStatusMap, setVmStatusMap] = useState<Record<string, VMStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVMs = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const allVMs = await listLabVMs();
      setVms(allVMs);

      const statuses = await Promise.all(
        allVMs.map(async (vm) => {
          try {
            const status = await getVMStatus(vm.vmId);
            return { vmId: vm.vmId, status };
          } catch {
            return { vmId: vm.vmId, status: { vmId: vm.vmId, status: 'idle' as const, createdAt: vm.createdAt } };
          }
        })
      );

      const map: Record<string, VMStatus> = {};
      statuses.forEach(({ vmId, status }) => { map[vmId] = status; });
      setVmStatusMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load VMs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchVMs(); }, [user]);

  const handleCreate = async () => {
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
      setVms(prev => [newVM, ...prev]);
      setVmStatusMap(prev => ({ ...prev, [newVM.vmId]: { vmId: newVM.vmId, status: 'running', createdAt: newVM.createdAt } }));
      onVMCreated?.(newVM);
      onVMSelect?.(newVM);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create VM');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (vmId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete VM ${vmId}?`)) return;
    try {
      await deleteLabVM(vmId);
      setVms(prev => prev.filter(vm => vm.vmId !== vmId));
      setVmStatusMap(prev => {
        const next = { ...prev };
        delete next[vmId];
        return next;
      });
      if (selectedVM?.vmId === vmId) {
        onVMSelect?.(vms.find(vm => vm.vmId !== vmId) || null as any);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const getStatusDot = (vmId: string) => {
    const status = vmStatusMap[vmId]?.status || 'unknown';
    switch (status) {
      case 'running': return 'bg-emerald-500';
      case 'creating': return 'bg-amber-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-tertiary/30';
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-label-mono text-[11px] uppercase tracking-wider text-tertiary">Projects</h3>
        </div>
        <button
          onClick={handleCreate}
          disabled={isCreating}
          className="w-full bg-primary text-on-primary px-4 py-2 rounded-lg font-label-mono text-[11px] hover:opacity-90 transition-all disabled:opacity-50 cursor-pointer border-none"
        >
          {isCreating ? 'Creating...' : '+ New Project'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <span className="font-label-mono text-[11px] text-red-400">{error}</span>
        </div>
      )}

      {/* VM List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : vms.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-3 opacity-30">🖥️</div>
            <p className="font-label-mono text-[11px] text-tertiary/50">No projects yet</p>
            <p className="font-label-mono text-[10px] text-tertiary/30 mt-1">Create a VM to get started</p>
          </div>
        ) : (
          vms.map((vm) => {
            const isSelected = selectedVM?.vmId === vm.vmId;
            return (
              <button
                key={vm.vmId}
                onClick={() => onVMSelect?.(vm)}
                className={`w-full text-left rounded-xl p-3 transition-all border ${
                  isSelected
                    ? 'bg-primary/10 border-primary/30'
                    : 'bg-surface-container/50 border-white/5 hover:border-white/10 hover:bg-surface-container'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusDot(vm.vmId)}`} />
                    <span className="font-label-mono text-[11px] text-on-surface truncate">
                      {vm.vmId.slice(0, 12)}...
                    </span>
                  </div>
                  <span
                    onClick={(e) => handleDelete(vm.vmId, e)}
                    className="text-tertiary/30 hover:text-red-400 transition-colors cursor-pointer text-xs px-1"
                    title="Delete"
                  >
                    ×
                  </span>
                </div>
                {vm.publicUrl && (
                  <div className="font-label-mono text-[10px] text-tertiary/40 truncate">
                    {vm.publicUrl.replace('https://', '')}
                  </div>
                )}
                <div className="font-label-mono text-[10px] text-tertiary/30 mt-1">
                  {new Date(vm.createdAt).toLocaleDateString()}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-white/5">
        <p className="font-label-mono text-[10px] text-tertiary/30 text-center">
          Powered by freestyle.sh
        </p>
      </div>
    </div>
  );
}
