import { setupBrowser, teardownBrowser } from './helpers/browser';
import { runSuite, printSummary } from './helpers/runner';
import { authSuite } from './specs/auth.spec';
import { dashboardSuite } from './specs/dashboard.spec';
import { playgroundSuite } from './specs/playground.spec';
import { taskSuite } from './specs/task.spec';

async function main() {
  console.log('🧪 Mizpa E2E Tests');
  console.log('═'.repeat(60));

  const ctx = await setupBrowser();

  try {
    await runSuite(authSuite, ctx);
    await runSuite(dashboardSuite, ctx);
    await runSuite(playgroundSuite, ctx);
    await runSuite(taskSuite, ctx);
  } finally {
    await teardownBrowser(ctx);
  }

  const success = printSummary();
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
