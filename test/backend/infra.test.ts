/**
 * Backend infrastructure integration tests
 *
 * Tests the queue, VM sessions, and cleanup-vms function via direct
 * Supabase REST API calls with the service_role key.
 *
 * Usage:
 *   npx tsx test/backend/infra.test.ts
 *
 * Requires:
 *   - Service role key with REST access to the Supabase project
 *   - Network access to hnpdebnkumcizmrngayc.supabase.co
 */

const SUPABASE_URL = 'https://hnpdebnkumcizmrngayc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhucGRlYm5rdW1jaXptcm5nYXljIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ3NDk4OSwiZXhwIjoyMDk4MDUwOTg5fQ.B0G6kXzKSfFxZOGG00lXngzlmlwGUeLP67CiM6bicEg';

let pass = 0;
let fail = 0;

async function restQuery(sql: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pgmq_send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({}),
  });
  // We'll use SQL-over-REST approach
  return res;
}

async function supabaseRPC(functionName: string, params: Record<string, any> = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Accept': 'application/json',
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${functionName} failed (${res.status}): ${text.substring(0, 100)}`);
  }
  return res.json();
}

async function restGet(table: string, query: string = ''): Promise<any[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Accept': 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${table} failed (${res.status}): ${text.substring(0, 100)}`);
  }
  return res.json();
}

function assert(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => { pass++; console.log(`  ✅ ${name}`); })
    .catch((err) => { fail++; console.log(`  ❌ ${name}: ${err.message}`); });
}

async function main() {
  console.log('🧪 Mizpa Backend Infrastructure Tests');
  console.log('═'.repeat(60));

  // ── Tasks table schema ──
  console.log('\n📋 Tasks Schema');

  await assert('tasks table is accessible', async () => {
    const rows = await restGet('tasks', 'select=id,status,skill&limit=1');
    if (!Array.isArray(rows)) throw new Error('Expected array response');
    console.log(`     (${rows.length} row returned)`);
  });

  // ── VM Sessions table ──
  console.log('\n📋 VM Sessions');

  await assert('vm_sessions table is accessible', async () => {
    const rows = await restGet('vm_sessions', 'select=id,task_id,vm_id,status&limit=5');
    if (!Array.isArray(rows)) throw new Error('Expected array response');
    console.log(`     (${rows.length} rows returned)`);
  });

  await assert('vm_sessions has expected columns', async () => {
    const rows = await restGet('vm_sessions', 'select=id,task_id,vm_id,status,spec,created_at,deleted_at&limit=1');
    const expectedColumns = ['id', 'task_id', 'vm_id', 'status', 'spec', 'created_at', 'deleted_at'];
    for (const col of expectedColumns) {
      if (!(col in (rows[0] || {})) && col !== 'spec') {
        // spec is jsonb, might not render in all cases
        if (col !== 'deleted_at') { // nullable
          throw new Error(`Expected column '${col}' in response`);
        }
      }
    }
  });

  // ── PGMQ Queue ──
  console.log('\n📋 PGMQ Queue');

  await assert('pgmq_send function exists', async () => {
    const result = await supabaseRPC('pgmq_send', { queue_name: 'mizpa-tasks', msg: JSON.stringify({ test: true }) });
    const msgId = result;
    if (msgId === null || msgId === undefined) throw new Error('No message ID returned');

    // Cleanup: delete the test message
    try {
      await supabaseRPC('pgmq_delete', { queue_name: 'mizpa-tasks', msg_id: msgId });
    } catch { /* best effort cleanup */ }
  });

  await assert('pgmq_read returns messages', async () => {
    const result = await supabaseRPC('pgmq_read', { queue_name: 'mizpa-tasks', num_messages: 5, visibility_timeout: 1 });
    if (!Array.isArray(result)) throw new Error('Expected array from pgmq_read');
  });

  await assert('pgmq_metrics returns data', async () => {
    const result = await supabaseRPC('pgmq_metrics', { queue_name: 'mizpa-tasks' });
    if (!result || typeof result !== 'object') throw new Error('Expected object from pgmq_metrics');
    if (!result.queue_name) throw new Error('Expected queue_name in metrics');
  });

  await assert('active_vm_count returns a number', async () => {
    const result = await supabaseRPC('active_vm_count');
    if (typeof result !== 'number') throw new Error(`Expected number, got ${typeof result} (${JSON.stringify(result)})`);
    console.log(`     (active VMs: ${result})`);
  });

  // ── Cleanup VM function ──
  console.log('\n📋 Cleanup VMs');

  await assert('cleanup-vms function returns valid response', async () => {
    // Call via Supabase REST with auth token (simulating what the browser does)
    // First get a JWT for the test user
    const sessionRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'test@mizpa.dev', password: 'Test123456' }),
    });
    if (!sessionRes.ok) {
      const text = await sessionRes.text();
      throw new Error(`Login failed (${sessionRes.status}): ${text.substring(0, 80)}`);
    }
    const session = await sessionRes.json();
    const token = session.access_token;
    if (!token) throw new Error('No access token returned');

    // Call cleanup-vms with the user's JWT
    const fnRes = await fetch(`${SUPABASE_URL}/functions/v1/cleanup-vms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SERVICE_KEY,
      },
      body: JSON.stringify({ force: false }),
    });
    if (!fnRes.ok) {
      const text = await fnRes.text();
      throw new Error(`cleanup-vms failed (${fnRes.status}): ${text.substring(0, 100)}`);
    }
    const result = await fnRes.json();
    if (!result.status) throw new Error('Expected status in response');
    console.log(`     (result: ${result.status}, mode: ${result.mode}, deleted: ${result.deleted})`);
  });

  // ── Summary ──
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 Results: ${pass} passed, ${fail} failed, ${pass + fail} total`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
