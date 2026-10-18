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
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { directives, runPart, startDevtools } from './devtools.mjs';

const devtools = await startDevtools();

const BASE = devtools.base;

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

let failures = 0;

for (const part of parts) {
  for (const kind of ['exercise', 'solution']) {
    const file = join('src', part, `${kind}.ts`);

    if (!existsSync(file)) continue;

    const start = Date.now() - 1000;
    const { code, output } = await runPart(file, BASE);
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
