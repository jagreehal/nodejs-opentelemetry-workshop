/**
 * The note dispenser driver, which ships with the ATM software.
 *
 * Do not read this file until you have found the cause from the data. It is
 * here for the same reason `src/bank/ledger.ts` was in part 10: the code that
 * explains your latency is usually somewhere you were not looking.
 */
import { sleep } from '../bank/index.ts';

export interface Machine {
  id: string;
  model: string;
  branch: string;
  softwareVersion: string;
}

/**
 * Count out the notes. Build 4.2.0 replaced the note-mix calculation, and on
 * Diebold hardware a mixed-denomination amount (£50 and over) now recalibrates
 * the cassettes before every dispense. Each condition alone is harmless.
 */
export async function dispense(machine: Machine, amountPence: number) {
  const recalibrates =
    machine.softwareVersion === '4.2.0' &&
    machine.model === 'Diebold-522' &&
    amountPence >= 5000;

  await sleep(recalibrates ? 600 : 30);
}
