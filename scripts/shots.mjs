/**
 * `pnpm shots` retakes every devtools screenshot the READMEs show.
 *
 * Each shot runs one part's file into a fresh devtools, then opens the view
 * the README describes. A fresh receiver per shot matters: devtools keeps the
 * latest 100 traces, and the service map draws every service it has seen.
 *
 * Rerun it after upgrading autotel-devtools so the pictures match what a
 * learner sees. Ids, timestamps and durations differ on every run, so expect
 * every PNG to change.
 *
 *   pnpm shots        every shot
 *   pnpm shots 04     the shots for one part
 */
import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { runPart, startDevtools } from './devtools.mjs';

/**
 * `query` is typed into the search box, as the README tells the learner to.
 * `open` shows the waterfall of the first trace that query matches instead.
 */
const SHOTS = [
  { part: '02', file: 'solution', name: 'traces', tab: 'traces' },
  { part: '03', file: 'solution', name: 'bridge-street', tab: 'traces', query: 'atm.branch = "bridge-street"' },
  { part: '04', file: 'solution', name: 'waterfall', tab: 'traces', query: 'name = "atm.withdraw" and duration > 200', open: true },
  { part: '05', file: 'solution', name: 'daily-limit', tab: 'traces', query: 'withdrawal.refusal_code = "DAILY_LIMIT_EXCEEDED" and account.balance_pence > 40000' },
  { part: '06', file: 'solution', name: 'one-withdrawal', tab: 'traces', query: 'name = "atm.withdraw"', open: true },
  { part: '07', file: 'solution', name: 'errors', tab: 'errors' },
  { part: '09', file: 'solution', name: 'metrics', tab: 'metrics' },
  { part: '10', file: 'exercise', name: 'slow', tab: 'traces', query: 'name = "atm.withdraw" and duration > 200' },
  { part: '11', file: 'exercise', name: 'three-traces', tab: 'traces' },
  { part: '11', file: 'solution', name: 'one-trace', tab: 'traces', query: 'name = "atm.withdraw"', open: true },
  { part: '11', file: 'solution', name: 'service-map', tab: 'service-map' },
  { part: '12', file: 'solution', name: 'canada-water', tab: 'traces', query: 'service = accounts-service and atm.branch = "canada-water"' },
  { part: '13', file: 'solution', name: 'dispense', tab: 'traces', query: 'name = "atm.dispense" and duration > 500', open: true },
];

// The resource detectors put your hostname, username and home directory on
// every span and metric label. Keep them out of a committed picture.
const ENV = { HOSTNAME: 'workshop', OTEL_NODE_RESOURCE_DETECTORS: 'none' };

/** The id of the first trace a query matches, asked of devtools directly. */
async function firstTrace(base, query) {
  const res = await fetch(`${base}/api/query/traces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: 1 }),
  });

  const id = (await res.json()).traces?.[0]?.traceId;

  if (!id) throw new Error(`no trace matched \`${query}\``);

  return id;
}

const dirs = readdirSync('src').filter((name) => /^\d\d-/.test(name));

const only = process.argv[2]?.padStart(2, '0');

const browser = await chromium.launch();

let failures = 0;

for (const shot of SHOTS.filter((s) => !only || s.part === only)) {
  const dir = join('src', dirs.find((name) => name.startsWith(shot.part)));
  const out = join(dir, 'images', `${shot.name}.png`);
  const devtools = await startDevtools();

  try {
    const { code, output } = await runPart(join(dir, `${shot.file}.ts`), devtools.base, ENV);

    if (code !== 0) throw new Error(`${shot.file}.ts exited ${code}\n${output}`);

    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
      colorScheme: 'light',
    });

    // The list re-renders as it ticks, so clicking a row is flaky. The URL
    // opens a trace directly.
    const trace = shot.open ? `&trace=${await firstTrace(devtools.base, shot.query)}` : '';

    await page.goto(`${devtools.base}/#tab=${shot.tab}${trace}`);
    await page.waitForLoadState('networkidle');

    if (shot.query && !shot.open) {
      const box = page.getByRole('textbox').first();
      await box.fill(shot.query);
      await box.press('Enter');
    }

    // ponytail: fixed settle time for results to render; wait on a selector
    // per view if a shot ever comes out half drawn.
    await delay(1500);

    mkdirSync(join(dir, 'images'), { recursive: true });
    await page.screenshot({ path: out });
    await page.close();
    console.log(`✓ ${out}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${out}: ${error.message}`);
  } finally {
    devtools.close();
  }
}

await browser.close();

if (failures > 0) process.exit(1);
