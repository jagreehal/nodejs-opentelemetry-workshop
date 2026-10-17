/**
 * Runs every exercise and solution in the repository and asserts that each one
 * still emits the spans its file says it emits.
 *
 * The workshop has no failing test suite by design: you learn by looking at a
 * trace, not by turning a suite green. That leaves the solutions with nothing
 * holding them up, so a change in autotel could break every part and the only
 * signal would be a learner's confusion three months from now. This script is
 * that signal, and it stays invisible to the learner.
 *
 * The expectations live next to the code they describe, one per line:
 *
 *   // check: name = "atm.withdraw"
 *
 * Anything after `check:` is a devtools query, so the assertion is written in
 * the same language the workshop teaches you to type into the search box.
 * Two more forms cover the parts that emit more than spans:
 *
 *   // check-metric: atm.withdraw.duration   a metric with that name arrived
 *   // check-log: pin ok                     a log with that text, linked to a trace
 *
 * A file can also name modules to preload, which run.mjs honours too:
 *
 *   // import: ./instrumentation.ts
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
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

const PORT = await freePort();

const BASE = `http://${HOST}:${PORT}`;

const isUp = async () => {
  try {
    const res = await fetch(`${BASE}/healthz`, {
      signal: AbortSignal.timeout(500),
    });

    return res.ok;
  } catch {
    return false;
  }
};

async function receiver() {
  const child = spawn(
    join('node_modules', '.bin', 'autotel-devtools'),
    ['--port', String(PORT), '--grpc-port', String(PORT + 1)],
    { stdio: 'ignore' },
  );

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(250);

    if (await isUp()) return { close: () => child.kill() };
  }

  child.kill();
  throw new Error(`autotel-devtools never came up on ${BASE}`);
}

/** Every `// <name>: value` line in a file, in order. */
const directives = (file, name) =>
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

const run = (file) =>
  new Promise((done) => {
    const child = spawn(tsx, [...preloads(file), file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: BASE },
    });

    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk));
    child.stderr.on('data', (chunk) => (output += chunk));
    child.on('exit', (code) => done({ code: code ?? 1, output }));
  });

async function traceCount(query, window) {
  const res = await fetch(`${BASE}/api/query/traces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, window, limit: 500 }),
  });

  const body = await res.json();

  if (body.errors)
    throw new Error(`bad query ${query}: ${JSON.stringify(body.errors)}`);

  return body.traces?.length ?? 0;
}

async function metricArrived(name, window) {
  const res = await fetch(`${BASE}/api/query/metrics`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });

  const body = await res.json();

  return (body.series ?? []).some((series) =>
    series.points.some((point) => point.timestamp >= window.start),
  );
}

async function linkedLogArrived(text, window) {
  const res = await fetch(`${BASE}/api/query/logs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: '', limit: 500 }),
  });

  const body = await res.json();

  return (body.logs ?? []).some(
    (log) =>
      log.timestamp >= window.start &&
      Boolean(log.traceId) &&
      String(log.body).includes(text),
  );
}

/** Each expectation a file declares, as a named assertion to run. */
const expectationsIn = (file) => [
  ...directives(file, 'check').map((query) => ({
    what: `no trace matched \`${query}\``,
    holds: async (window) => (await traceCount(query, window)) > 0,
  })),
  ...directives(file, 'check-metric').map((name) => ({
    what: `no metric named \`${name}\` arrived`,
    holds: (window) => metricArrived(name, window),
  })),
  ...directives(file, 'check-log').map((text) => ({
    what: `no log containing \`${text}\` arrived with a trace id`,
    holds: (window) => linkedLogArrived(text, window),
  })),
];

const parts = readdirSync('src', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^\d\d-/.test(entry.name))
  .map((entry) => entry.name)
  .sort();

const devtools = await receiver();

let failures = 0;

for (const part of parts) {
  for (const kind of ['exercise', 'solution']) {
    const file = join('src', part, `${kind}.ts`);

    if (!existsSync(file)) continue;

    const start = Date.now() - 1000;
    const { code, output } = await run(file);
    const end = Date.now() + 1000;
    const label = `${part}/${kind}`;

    if (code !== 0) {
      failures += 1;
      console.error(`✗ ${label} exited ${code}\n${output}`);
      continue;
    }

    // Give the exporter's last flush time to land in the store.
    await delay(300);

    let ok = true;

    for (const expectation of expectationsIn(file)) {
      if (await expectation.holds({ start, end })) continue;

      ok = false;
      failures += 1;
      console.error(`✗ ${label}: ${expectation.what}`);
    }

    if (ok) console.log(`✓ ${label}`);
  }
}

devtools.close();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log('\nAll parts run and emit what they claim to emit.');
