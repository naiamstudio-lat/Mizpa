import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface TaskUpdate {
  id: string;
  site_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  vm_id: string | null;
  output: string | null;
  error_log: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface UseTaskRealtimeOptions {
  siteId: string;
  taskId?: string;
  onStatusChange?: (task: TaskUpdate) => void;
  onCompleted?: (task: TaskUpdate) => void;
  onFailed?: (task: TaskUpdate) => void;
}

export function useTaskRealtime({
  siteId,
  taskId,
  onStatusChange,
  onCompleted,
  onFailed
}: UseTaskRealtimeOptions) {
  const [currentTask, setCurrentTask] = useState<TaskUpdate | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleTaskUpdate = useCallback((payload: any) => {
    const task = payload.new as TaskUpdate;
    
    // Filter by taskId if provided
    if (taskId && task.id !== taskId) return;
    
    setCurrentTask(task);
    onStatusChange?.(task);
    
    if (task.status === 'completed') {
      onCompleted?.(task);
    } else if (task.status === 'failed') {
      onFailed?.(task);
    }
  }, [taskId, onStatusChange, onCompleted, onFailed]);

  useEffect(() => {
    if (!siteId) return;

    const channel = supabase
      .channel(`task-updates-${siteId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'task_queue',
          filter: `site_id=eq.${siteId}`
        },
        handleTaskUpdate
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [siteId, handleTaskUpdate]);

  return {
    currentTask,
    isConnected
  };
}
