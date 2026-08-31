/**
 * Node module-customization hooks that make src/worker.ts loadable outside
 * workerd. Two things in that file cannot resolve under Node:
 *
 *   - `cloudflare:workers`, mapped to ./cloudflare-workers-stub.mjs;
 *   - the sixteen `../migrations-sqlite/*.sql` imports, which exist only
 *     because wrangler's default Text rule bundles them as strings. The load
 *     hook does exactly what wrangler does — hands back the file's text as the
 *     module's default export — and rewrites the compiled test build's
 *     `.build/migrations-sqlite/...` back to the real directory.
 *
 * Nothing else is intercepted, so what the test runs is the shipped file.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const STUB = new URL('./cloudflare-workers-stub.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return { url: STUB, shortCircuit: true };
  if (specifier.endsWith('.sql')) {
    const url = new URL(specifier, context.parentURL).href.replace('/.build/', '/');
    return { url, format: 'module', shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('.sql')) {
    const text = await readFile(fileURLToPath(url), 'utf8');
    return { format: 'module', source: `export default ${JSON.stringify(text)};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
