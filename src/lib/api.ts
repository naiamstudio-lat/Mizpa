/**
 * Mizpa API client
 * Handles communication with Supabase Edge Functions
 */

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface CreateTaskResponse {
  taskId: string;
  vmId?: string;
  status: string;
  message: string;
}

export interface TaskStatus {
  id: string;
  skill: string;
  url: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  vm_id: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TaskResult {
  id: string;
  task_id: string;
  result_type: string;
  content: Record<string, unknown>;
  created_at: string;
}

/**
 * Create a new agent task
 */
export async function createTask(
  skill: string,
  url: string
): Promise<CreateTaskResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  console.log('Session exists:', !!session, 'token length:', session?.access_token?.length || 0);

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-task`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ skill, url }),
  });

  console.log('Response status:', response.status);

  if (!response.ok) {
    const error = await response.json();
    console.log('Error response:', error);
    throw new Error(error.error || 'Failed to create task');
  }

  return response.json();
}

/**
 * Get task status
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get task results
 */
export async function getTaskResults(taskId: string): Promise<TaskResult[]> {
  const { data, error } = await supabase
    .from('task_results')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Cleanup idle freestyle VMs
 */
export async function cleanupVms(force: boolean = false): Promise<{
  status: string;
  mode: string;
  totalVms: number;
  deleted: number;
  skipped: number;
  message: string;
}> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/cleanup-vms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ force }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to cleanup VMs');
  }

  return response.json();
}

/**
 * Poll task status until completion
 */
export async function pollTaskStatus(
  taskId: string,
  onStatusChange?: (status: TaskStatus) => void,
  intervalMs: number = 2000,
  maxAttempts: number = 150 // 5 minutes max
): Promise<TaskStatus> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const status = await getTaskStatus(taskId);
    onStatusChange?.(status);

    if (status.status === 'completed' || status.status === 'failed') {
      return status;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error('Task polling timeout');
}
