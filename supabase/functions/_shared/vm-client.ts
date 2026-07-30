/**
 * Shared VM client for Mizpa
 * Centralized from freestyle.ts to avoid code duplication
 * Uses direct HTTP calls (no npm dependency issues in Deno)
 */

const FREESTYLE_API = 'https://api.freestyle.sh';

function getApiKey(): string {
  const key = Deno.env.get('FREESTYLE_API_KEY');
  if (!key) throw new Error('FREESTYLE_API_KEY not set');
  return key;
}

function headers(): Record<string, string> {
  return {
    'Authorization': `Bearer ${getApiKey()}`,
    'Content-Type': 'application/json',
  };
}

export interface VmCreateResult {
  vmId: string;
  vm: {
    exec: (cmd: string) => Promise<{ stdout: string; stderr: string; statusCode?: number }>;
    stop: () => Promise<void>;
    delete: () => Promise<void>;
  };
}

export async function createVm(opts?: {
  idleTimeoutSeconds?: number;
  name?: string;
  snapshotId?: string;
}): Promise<VmCreateResult> {
  const body: Record<string, unknown> = {};
  if (opts?.idleTimeoutSeconds) body.idleTimeoutSeconds = opts.idleTimeoutSeconds;
  if (opts?.name) body.name = opts.name;
  if (opts?.snapshotId) body.snapshotId = opts.snapshotId;

  const res = await fetch(`${FREESTYLE_API}/v1/vms`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`VM create failed: ${res.status} ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  const vmId = data.vmId || data.id;

  return {
    vmId,
    vm: {
      exec: async (cmd: string) => {
        const execRes = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}/exec-await`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify({ command: cmd }),
        });
        if (!execRes.ok) {
          const err = await execRes.json().catch(() => ({}));
          throw new Error(`Exec failed: ${execRes.status} ${JSON.stringify(err)}`);
        }
        return execRes.json();
      },
      stop: async () => {
        await fetch(`${FREESTYLE_API}/v1/vms/${vmId}/stop`, {
          method: 'POST',
          headers: headers(),
        });
      },
      delete: async () => {
        await fetch(`${FREESTYLE_API}/v1/vms/${vmId}`, {
          method: 'DELETE',
          headers: headers(),
        });
      },
    },
  };
}

export async function listVms() {
  const res = await fetch(`${FREESTYLE_API}/v1/vms`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`List VMs failed: ${res.status}`);
  return res.json();
}

export async function deleteVm(vmId: string) {
  const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Delete VM failed: ${res.status}`);
  return res.json();
}

/**
 * Standalone exec function for fire-and-forget VM commands.
 * This is a separate function (not attached to a VmCreateResult.vm object)
 * for use by process-queue and other functions that create VMs directly.
 */
export async function execVm(vmId: string, cmd: string): Promise<{ stdout: string; stderr: string; statusCode?: number }> {
  const res = await fetch(`${FREESTYLE_API}/v1/vms/${vmId}/exec-await`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ command: cmd }),
  });
  if (!res.ok) throw new Error(`Exec failed: ${res.status}`);
  return res.json();
}

export { headers as freestyleHeaders };
export { getApiKey };
export type { VmCreateResult };
