/**
 * The type environment for the deployed entry point. Read this beside
 * `tsconfig.worker.json`, which is plain JSON with no comments of its own
 * because `tools/ci.sh` reads every `service/tsconfig*.json` with JSON.parse
 * to derive — from the tree, not from memory — whether anything checks the
 * worker.
 *
 * WHY THERE IS A THIRD TSCONFIG. `wrangler.jsonc` points `main` at
 * `src/worker.ts`, and both `tsconfig.json` and `tsconfig.test.json` list it
 * under `exclude`. Nothing type-checked it and no test ran it, so
 * `alarm()` called `processDueJobs` without importing it from `de4abbe`
 * (2026-08-28) until this file was written: esbuild strips types and compiles
 * an unbound identifier into a free global, so the bundle shipped and threw
 * ReferenceError the first time an alarm fired.
 *
 * WHY THE WORKERS TYPES ARE GENERATED RATHER THAN DEPENDED ON.
 * `worker-configuration.d.ts` comes from `npx wrangler types`, which emits the
 * globals for this project's own `compatibility_date` and
 * `compatibility_flags` — currently 2026-08-01 with `nodejs_compat`. Depending
 * on `@cloudflare/workers-types` directly does not work here: its stable
 * entrypoint still ships the pre-`nodejs_compat` shim `declare const Buffer:
 * any`, which suppresses @types/node's global `Buffer` interface and turns
 * `randomBytes(32).toString('base64url')` — `app.ts:67`, `identity.ts:14`,
 * both correct and both covered by the suite — into two standing false errors.
 * Sixteen errors of ambient noise are what hid the seventeenth; two would be a
 * smaller version of the same disease. Re-run `npx wrangler types` from
 * `service/` after editing `wrangler.jsonc`.
 *
 * WHAT IS DECLARED BELOW. The Worker bundles its migrations as text: wrangler's
 * default Text rule turns `import schema from '../migrations-sqlite/00N_x.sql'`
 * into a string. No bundler-independent type exists for that, so it is declared
 * once here rather than suppressed at each of the sixteen call sites — eleven
 * of which carried a `@ts-expect-error` that no configuration ever evaluated,
 * and five of which carried nothing at all.
 */
declare module '*.sql' {
  const sql: string;
  export default sql;
}
