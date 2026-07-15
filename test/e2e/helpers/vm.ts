/**
 * Helpers for VM-related test instrumentation.
 *
 * This file should be extended to include test-only APIs for probing the VM
 * manager: listing active VMs, their owner (user id), lifecycle timestamps,
 * and stats (cpu/memory) to assist in asserting optimization rules.
 *
 * In CI we used to rely on external infra; for local/e2e testing add a small
 * HTTP test endpoint or a mocked SDK that exposes VM state to the tests.
 */

export async function getActiveVMs() {
  // TODO: implement: query test-only endpoint or read from test fixture
  return [] as Array<{ id: string; owner?: string; status?: string }>;
}

export async function waitForVMState(vmId: string, state: string, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const vms = await getActiveVMs();
    const vm = vms.find(v => v.id === vmId);
    if (vm && vm.status === state) return vm;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`VM ${vmId} did not reach state ${state} within ${timeout}ms`);
}
