import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface LabVM {
  vmId: string;
  publicUrl: string;
  previewUrl?: string;
  status: 'idle' | 'creating' | 'running' | 'error';
  createdAt: string;
  lastUsed?: string;
}

export interface VMStatus {
  vmId: string;
  status: 'idle' | 'creating' | 'running' | 'stopped' | 'error';
  publicUrl?: string;
  previewUrl?: string;
  createdAt: string;
  taskCount?: number;
}

export interface CreateLabResponse {
  vmId: string;
  publicUrl: string;
  previewUrl?: string;
  previewPort?: number;
  message: string;
}

export interface CreateLabOptions {
  idleTimeoutSeconds?: number;
  name?: string;
  snapshotId?: string;
  force?: boolean;
  previewPort?: number;
}

export interface LabTask {
  taskId: string;
  vmId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  command: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  error?: string;
}

/**
 * Create a new freestyle.sh VM for the lab
 */
export async function createLabVM(
  options?: CreateLabOptions
): Promise<CreateLabResponse> {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  
  if (sessionError) {
    console.error('[createLabVM] Session error:', sessionError);
    throw new Error('Session error: ' + sessionError.message);
  }
  
  if (!session) {
    console.error('[createLabVM] No session found');
    throw new Error('Not authenticated - no session');
  }

  console.log('[createLabVM] Token length:', session.access_token?.length);
  console.log('[createLabVM] URL:', `${SUPABASE_URL}/functions/v1/create-lab`);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lab`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(options || {}),
  });

  console.log('[createLabVM] Response:', response.status, response.statusText);

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: await response.text() };
    }
    console.error('[createLabVM] Error:', errorData);
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * List all lab VMs
 */
export async function listLabVMs(): Promise<LabVM[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lab?mode=list`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to list VMs');
  }

  return response.json();
}

/**
 * Get VM status
 */
export async function getVMStatus(vmId: string): Promise<VMStatus> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lab?mode=status&vmId=${vmId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get VM status');
  }

  return response.json();
}

/**
 * Delete a VM
 */
export async function deleteLabVM(vmId: string): Promise<{ success: boolean; message: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lab?mode=delete&vmId=${vmId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete VM');
  }

  return response.json();
}

/**
 * Execute a command on a VM
 */
export async function execVMCommand(
  vmId: string,
  command: string,
  options?: {
    timeout?: number;
  }
): Promise<{ stdout: string; stderr: string; statusCode: number; command: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lab?mode=exec&vmId=${vmId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ command, timeout: options?.timeout || 300000 }), // 5 minutes default
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to execute command');
  }

  return response.json();
}

/**
 * Get tasks for a VM
 */
export async function getVMTasks(vmId: string): Promise<LabTask[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await fetch(`${SUPABASE_URL}/functions/v1/create-lab?mode=tasks&vmId=${vmId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to get VM tasks');
  }

  return response.json();
}

/**
 * Poll VM status until a specific state
 */
export async function pollVMStatus(
  vmId: string,
  targetStatus: 'running' | 'error' | 'stopped',
  intervalMs: number = 2000,
  maxAttempts: number = 60
): Promise<VMStatus> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const status = await getVMStatus(vmId);
    
    if (status.status === targetStatus) {
      return status;
    }
    
    if (status.status === 'error') {
      throw new Error(`VM ${vmId} failed to reach target status: ${status.status}`);
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error(`VM status polling timeout after ${maxAttempts} attempts`);
}