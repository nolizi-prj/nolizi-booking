/**
 * Stands in for the `cloudflare:workers` module so that src/worker.ts — the
 * deployed entry point — can be loaded and run under Node's test runner.
 *
 * The stub is deliberately the whole of what worker.ts uses from that module:
 * the DurableObject base class, whose entire contract here is that it holds
 * `ctx` and `env` for the subclass. Everything else the test exercises is the
 * real thing — the real worker.ts, the real app/automation code it imports,
 * and a real SQLite database underneath the storage shim.
 */
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
