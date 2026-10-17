/**
 * `pnpm ex 04`  runs the exercise in the part whose directory starts with 04.
 * `pnpm sol 04` runs our solution to it.
 *
 * Watch mode, because the loop this workshop wants is edit, save, look at the
 * trace. A part runs to completion and exits; saving the file runs it again.
 *
 * A file that starts with `// import: ./instrumentation.ts` gets that module
 * preloaded with `--import`, the way you would start the app at work.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';

const tsx = join('node_modules', '.bin', 'tsx');

const [kind, requested] = process.argv.slice(2);

const parts = readdirSync('src', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d\d-/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

if (!requested) {
  console.error(`usage: pnpm ${kind === 'solution' ? 'sol' : 'ex'} <part>\n`);

  for (const part of parts) console.error(`  ${part}`);
  process.exit(1);
}

const match = parts.find((part) => part.startsWith(requested.padStart(2, '0')));

if (!match) {
  console.error(`No part matches "${requested}". Available:\n`);

  for (const part of parts) console.error(`  ${part}`);
  process.exit(1);
}

const file = join('src', match, `${kind}.ts`);

const preloads = readFileSync(file, 'utf8')
  .split('\n')
  .flatMap((line) => {
    const path = /^\s*\/\/\s*import:\s*(.+)$/.exec(line)?.[1]?.trim();

    return path ? ['--import', `./${join(dirname(file), path)}`] : [];
  });

// The ESM loader hook uses Node's experimental type stripping and says so on
// every run. The notice is about Node, not your code, so a preloading part
// hides that one category.
const quiet =
  preloads.length > 0 ? ['--disable-warning=ExperimentalWarning'] : [];

const args = ['watch', ...quiet, ...preloads, file];

console.log(`▶ tsx ${args.join(' ')}\n`);

spawn(tsx, args, { stdio: 'inherit' }).on('exit', (code) =>
  process.exit(code ?? 0),
);
