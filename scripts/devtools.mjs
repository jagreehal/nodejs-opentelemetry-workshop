/**
 * What check.mjs and shots.mjs share: a private devtools on a free port, and a
 * way to run one part's file into it once, without watch mode.
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const HOST = '127.0.0.1';

const tsx = join('node_modules', '.bin', 'tsx');

/** A port nothing else holds, so a devtools the learner left running is safe. */
const freePort = () =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, HOST, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

const isUp = async (base) => {
  try {
    const res = await fetch(`${base}/healthz`, {
      signal: AbortSignal.timeout(500),
    });

    return res.ok;
  } catch {
    return false;
  }
};

/** Starts devtools and resolves once it answers, with its URL and a way to stop it. */
export async function startDevtools() {
  const port = await freePort();
  const base = `http://${HOST}:${port}`;

  // AUTOTEL_DEVTOOLS=/path/to/autotel-devtools/dist/cli.js runs a local build
  // instead, to check a devtools change against the workshop before release.
  const bin = process.env.AUTOTEL_DEVTOOLS;

  const child = spawn(
    bin ? process.execPath : join('node_modules', '.bin', 'autotel-devtools'),
    [...(bin ? [bin] : []), '--port', String(port), '--grpc-port', String(port + 1)],
    { stdio: 'ignore' },
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(250);

    if (await isUp(base)) return { base, close: () => child.kill() };
  }

  child.kill();
  throw new Error(`autotel-devtools never came up on ${base}`);
}

/** Every `// <name>: value` line in a file, in order. */
export const directives = (file, name) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => new RegExp(`^\\s*//\\s*${name}:\\s*(.+)$`).exec(line)?.[1]?.trim())
    .filter(Boolean);

/** `--import` flags for the modules a file asks to preload. */
const preloads = (file) =>
  directives(file, 'import').flatMap((path) => [
    // Same reason as run.mjs: the loader hook's notice is about Node.
    '--disable-warning=ExperimentalWarning',
    '--import',
    pathToFileURL(resolve(dirname(file), path)).href,
  ]);

/** Runs one part's file to completion, exporting to `base`. */
export const runPart = (file, base, env = {}) =>
  new Promise((done) => {
    const child = spawn(tsx, [...preloads(file), file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env, OTEL_EXPORTER_OTLP_ENDPOINT: base },
    });

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => done({ code: code ?? 1, output }));
  });
