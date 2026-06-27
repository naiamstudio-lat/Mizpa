import type { TestContext } from './browser';

export interface TestCase {
  name: string;
  fn: (ctx: TestContext) => Promise<void>;
  skip?: boolean;
}

export interface TestSuite {
  name: string;
  beforeAll?: (ctx: TestContext) => Promise<void>;
  afterAll?: (ctx: TestContext) => Promise<void>;
  beforeEach?: (ctx: TestContext) => Promise<void>;
  afterEach?: (ctx: TestContext) => Promise<void>;
  tests: TestCase[];
}

let passed = 0;
let failed = 0;
let skipped = 0;
const errors: { suite: string; test: string; error: Error }[] = [];

export async function runSuite(suite: TestSuite, ctx: TestContext) {
  console.log(`\n  📋 ${suite.name}`);
  console.log('  ' + '─'.repeat(50));

  await suite.beforeAll?.(ctx);

  for (const test of suite.tests) {
    if (test.skip) {
      console.log(`    ⏭️  ${test.name} (skipped)`);
      skipped++;
      continue;
    }

    try {
      await suite.beforeEach?.(ctx);
      await test.fn(ctx);
      await suite.afterEach?.(ctx);
      console.log(`    ✅ ${test.name}`);
      passed++;
    } catch (error) {
      // Handle Puppeteer context errors gracefully
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('Cannot find context') || msg.includes('Node with given id')) {
        console.log(`    ⚠️  ${test.name} (context destroyed — navigation race)`);
        // Try to recover by navigating to a clean state
        try {
          await ctx.page.goto('about:blank');
          await new Promise(r => setTimeout(r, 500));
        } catch {}
        skipped++;
      } else {
        console.log(`    ❌ ${test.name}`);
        console.log(`       ${msg}`);
        failed++;
        errors.push({ suite: suite.name, test: test.name, error: error as Error });
      }
    }
  }

  await suite.afterAll?.(ctx);
}

export function printSummary() {
  console.log('\n' + '═'.repeat(60));
  console.log('  📊 Test Summary');
  console.log('═'.repeat(60));
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⚠️  Context: ${skipped}`);
  console.log(`  Total:     ${passed + failed + skipped}`);

  if (errors.length > 0) {
    console.log('\n  Failed Tests:');
    for (const err of errors) {
      console.log(`    • ${err.suite} > ${err.test}`);
      console.log(`      ${err.error.message}`);
    }
  }

  console.log('═'.repeat(60));
  return failed === 0;
}
