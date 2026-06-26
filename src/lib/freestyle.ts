/**
 * Freestyle.sh client wrapper for Mizpa
 * Handles VM creation, execution, and cleanup
 */

// VM specification for Mizpa tasks
export interface VmSpec {
  vcpu?: number;
  memory?: number;
  storage?: number;
  snapshot?: string;
  idleTimeoutSeconds?: number;
}

// Task types that map to VM configurations
export const TASK_VM_SPECS: Record<string, VmSpec> = {
  replica: {
    vcpu: 4,
    memory: 8192,
    storage: 20480,
    idleTimeoutSeconds: 1800, // 30 min
  },
  audit: {
    vcpu: 2,
    memory: 4096,
    storage: 10240,
    idleTimeoutSeconds: 900, // 15 min
  },
  generate: {
    vcpu: 4,
    memory: 8192,
    storage: 20480,
    idleTimeoutSeconds: 1800, // 30 min
  },
};

/**
 * Create a VM for a Mizpa task
 * In production, this uses the freestyle SDK
 * For now, it returns simulated values
 */
export async function createTaskVm(
  taskId: string,
  skill: string,
  _callbackUrl: string
): Promise<{ vmId: string; vmToken: string }> {
  const spec = TASK_VM_SPECS[skill] || TASK_VM_SPECS.audit;

  console.log(`Creating VM for task ${taskId} with spec:`, spec);

  // TODO: Replace with actual freestyle SDK calls
  // import { freestyle } from "freestyle-sandboxes";
  //
  // const { vm, vmId } = await freestyle.vms.create({
  //   vcpu: spec.vcpu,
  //   memory: spec.memory,
  //   storage: spec.storage,
  //   idleTimeoutSeconds: spec.idleTimeoutSeconds,
  // });
  //
  // const { identity } = await freestyle.identities.create();
  // await identity.permissions.vms.grant({ vmId });
  // const { token } = await identity.tokens.create();
  //
  // // Clone base image with agent tools
  // await vm.exec("bash /setup.sh --skill " + skill);
  //
  // return { vmId, vmToken: token };

  // Simulated response
  const simulatedVmId = `vm-${taskId.slice(0, 8)}`;
  const simulatedToken = `token-${Date.now()}`;

  return {
    vmId: simulatedVmId,
    vmToken: simulatedToken,
  };
}

/**
 * Execute a command in a VM
 */
export async function execInVm(
  vmId: string,
  command: string
): Promise<string> {
  console.log(`Executing in ${vmId}: ${command}`);

  // TODO: Replace with actual freestyle SDK
  // const { vm } = await freestyle.vms.get({ vmId });
  // const result = await vm.exec(command);
  // return result;

  return `Simulated output for: ${command}`;
}

/**
 * Stop and delete a VM
 */
export async function cleanupVm(vmId: string): Promise<void> {
  console.log(`Cleaning up VM: ${vmId}`);

  // TODO: Replace with actual freestyle SDK
  // const { vm } = await freestyle.vms.get({ vmId });
  // await vm.stop();
  // await vm.delete();
}

/**
 * Send results back to the callback URL
 */
export async function sendCallback(
  callbackUrl: string,
  taskId: string,
  status: string,
  results?: Array<{ type: string; content: unknown }>,
  error?: string
): Promise<void> {
  const payload = {
    taskId,
    status,
    results: results || [],
    error,
  };

  console.log(`Sending callback to ${callbackUrl}:`, payload);

  // TODO: In production, this would be called from inside the VM
  // The VM agent would POST results back to the Supabase Edge Function
  //
  // await fetch(callbackUrl, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'x-webhook-secret': Deno.env.get('TASK_WEBHOOK_SECRET'),
  //   },
  //   body: JSON.stringify(payload),
  // });
}
