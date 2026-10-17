/**
 * Part 6: the setup file, loaded before the app.
 *
 * `pnpm sol 06` runs `tsx --import ./instrumentation.ts solution.ts`, so this
 * file finishes before solution.ts imports anything. The Pino instrumentation
 * is in place when Pino loads, and patches it on the way in.
 *
 * At work the same idea is `node --import ./instrumentation.js app.js`.
 */

// Installs the loader hook that lets instrumentation patch ES modules as they
// load. It has to come before anything that should be patched.
import 'autotel/register';
import { init } from 'autotel';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

init({
  service: 'atm',
  devtools: true,
  instrumentations: [new PinoInstrumentation()],
});
