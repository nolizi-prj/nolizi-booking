/**
 * SPEC-0004 R6 — a node:test reporter that writes the conformance summary a
 * published report embeds. Counts are test points as the node:test runner
 * reports them. Output: .build/conformance.json (relative to the cwd of
 * `npm run conformance`, which is service/).
 */
import { mkdir, writeFile } from 'node:fs/promises';

export default async function* summaryReporter(source) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for await (const event of source) {
    if (event.type === 'test:pass') {
      if (event.data.skip || event.data.todo) skipped += 1;
      else passed += 1;
    } else if (event.type === 'test:fail') {
      failed += 1;
    }
  }
  const summary = {
    suite: 'pumasi-booking service acceptance',
    passed,
    failed,
    skipped,
    run_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
  await mkdir('.build', { recursive: true });
  await writeFile('.build/conformance.json', `${JSON.stringify(summary, null, 2)}\n`);
  yield `conformance: ${passed} passed, ${failed} failed, ${skipped} skipped → .build/conformance.json\n`;
}
