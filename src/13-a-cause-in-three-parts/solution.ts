/**
 * Part 13: Our solution: rank the fields, then test the combination
 *
 *   pnpm sol 13
 */
// check: name = "atm.withdraw"
// check: name = "atm.dispense"
// check: atm.software_version = "4.2.0"
// check: name = "atm.dispense" and duration > 500
// check: atm.software_version = "4.2.0" and atm.model = "Diebold-522" and withdrawal.amount_band = ">=5000"
import { init, trace, getRequestLogger, shutdown } from 'autotel';
import { bucket, compareCohorts, type AnalysisEvent } from 'autotel/analysis';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  isBankError,
  users,
  resetBalances,
} from '../bank/index.ts';
import { dispense, type Machine } from './dispenser.ts';

init({ service: 'atm', devtools: true });

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

const tracedDispense = trace('atm.dispense', dispense);

const MACHINES: Machine[] = [
  { id: 'atm_0431', model: 'NCR-6622', branch: 'bridge-street', softwareVersion: '4.1.3' },
  { id: 'atm_0912', model: 'NCR-6622', branch: 'kings-cross', softwareVersion: '4.1.3' },
  { id: 'atm_0977', model: 'NCR-6622', branch: 'canada-water', softwareVersion: '4.2.0' },
  { id: 'atm_1180', model: 'Diebold-522', branch: 'bridge-street', softwareVersion: '4.1.3' },
  { id: 'atm_1204', model: 'Diebold-522', branch: 'canada-water', softwareVersion: '4.1.3' },
  { id: 'atm_1251', model: 'Diebold-522', branch: 'bridge-street', softwareVersion: '4.2.0' },
  { id: 'atm_1266', model: 'Diebold-522', branch: 'kings-cross', softwareVersion: '4.2.0' },
  { id: 'atm_1330', model: 'Wincor-2100', branch: 'canada-water', softwareVersion: '4.1.3' },
  { id: 'atm_1342', model: 'Wincor-2100', branch: 'kings-cross', softwareVersion: '4.1.3' },
  { id: 'atm_1388', model: 'Wincor-2100', branch: 'bridge-street', softwareVersion: '4.2.0' },
];

const AMOUNTS = [1000, 2000, 5000, 1500, 6000];

/** Kept alongside the spans so the analysis loop can run in this file too. */
const observed: Array<AnalysisEvent & { durationMs: number }> = [];

const withdraw = trace(
  'atm.withdraw',
  async (machine: Machine, cardNumber: string, amountPence: number) => {
    const log = getRequestLogger();
    const startedAt = performance.now();

    const fields: AnalysisEvent = {
      'atm.id': machine.id,
      'atm.model': machine.model,
      'atm.branch': machine.branch,
      'atm.software_version': machine.softwareVersion,
      'withdrawal.amount_band': bucket(amountPence, [2000, 5000]),
    };

    log.set({
      atm: {
        id: machine.id,
        model: machine.model,
        branch: machine.branch,
        software_version: machine.softwareVersion,
      },
      withdrawal: {
        amount_pence: amountPence,
        amount_band: fields['withdrawal.amount_band'],
      },
    });

    try {
      const user = await tracedFindUser(cardNumber);
      fields['user.id'] = user.id;
      log.set({ user: { id: user.id } });
      await tracedVerifyPin(cardNumber, '1234');

      const account = await tracedGetAccount(user.id);
      fields['account.shard'] = account.shard;
      log.set({ account: { id: account.id, shard: account.shard } });

      const receipt = await tracedDebit(account, amountPence);
      await tracedDispense(machine, amountPence);
      fields['withdrawal.result'] = 'dispensed';
      log.set({ withdrawal: { result: 'dispensed' } });

      return receipt;
    } catch (error) {
      fields['withdrawal.result'] = 'refused';
      fields['withdrawal.refusal_code'] = isBankError(error)
        ? error.code
        : 'UNEXPECTED';
      log.set({
        withdrawal: {
          result: fields['withdrawal.result'],
          refusal_code: fields['withdrawal.refusal_code'],
        },
      });
      throw error;
    } finally {
      log.emitNow();
      observed.push({ ...fields, durationMs: performance.now() - startedAt });
    }
  },
);

/** What a dashboard shows: one label at a time, one number per value. */
function p95By(field: string) {
  const groups = new Map<string, number[]>();

  for (const event of observed) {
    const value = String(event[field]);
    groups.set(value, [...(groups.get(value) ?? []), event.durationMs]);
  }

  return [...groups].map(([value, durations]) => {
    const sorted = durations.sort((a, b) => a - b);

    return `${value} ${Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]!)}ms`;
  });
}

async function main() {
  // Twenty mornings, ten withdrawals each. A fresh morning resets the daily
  // limit, so nobody is refused and every withdrawal reaches the dispenser.
  for (let start = 0; start < 200; start += 10) {
    resetBalances();
    await Promise.all(
      Array.from({ length: 10 }, (_, offset) => start + offset).map((index) => {
        const machine = MACHINES[index % MACHINES.length]!;
        const user = users[index % users.length]!;
        // Each batch of ten uses one amount, so amount and machine vary
        // independently, the way they do in production.
        const amountPence = AMOUNTS[(start / 10) % AMOUNTS.length]!;

        return withdraw(machine, user.cardNumber, amountPence).catch(() => {
          /* refusals are expected; part 7 covered them */
        });
      }),
    );
  }

  await shutdown();

  console.log('\nThe dashboard, p95 by one label at a time:\n');

  for (const field of ['atm.software_version', 'atm.model', 'withdrawal.amount_band', 'atm.branch']) {
    console.log(`  ${field.padEnd(24)} ${p95By(field).join('   ')}`);
  }

  // Step 3 of the loop: what separates slow from normal?
  const slow = observed.filter((event) => event.durationMs > 500);
  const normal = observed.filter((event) => event.durationMs <= 500);

  const differences = compareCohorts({
    outlier: slow,
    baseline: normal,
    ignoreFields: ['durationMs'],
  });

  console.log(`\n${slow.length} slow of ${observed.length}. What separates them:\n`);
  console.log('  field                    value          in slow   in normal');

  for (const d of differences.slice(0, 6)) {
    console.log(
      `  ${d.field.padEnd(24)} ${d.value.padEnd(14)} ${(d.outlierFraction * 100).toFixed(0).padStart(6)}%   ${(d.baselineFraction * 100).toFixed(0).padStart(7)}%`,
    );
  }

  // Tied rows say each value is on every slow withdrawal, not whether one is
  // enough to describe them. Test every subset of the suspects: the smallest
  // one that selects exactly the slow withdrawals describes the cohort.
  const suspects: Array<[string, string]> = [
    ['atm.software_version', '4.2.0'],
    ['atm.model', 'Diebold-522'],
    ['withdrawal.amount_band', '>=5000'],
  ];

  console.log('\n  4.2.0  Diebold  >=5000   withdrawals   slow');

  let smallest: Array<[string, string]> | undefined;

  for (let mask = 1; mask < 8; mask += 1) {
    const chosen = suspects.filter((_, i) => mask & (1 << i));

    const matching = observed.filter((event) =>
      chosen.every(([field, value]) => event[field] === value),
    );

    const slowCount = matching.filter((event) => event.durationMs > 500).length;

    if (
      matching.length === slow.length &&
      slowCount === slow.length &&
      (!smallest || chosen.length < smallest.length)
    ) {
      smallest = chosen;
    }

    const tick = (i: number) => ((mask & (1 << i)) ? 'yes' : ' - ').padEnd(8);

    console.log(
      `  ${tick(0)}${tick(1)}${tick(2)} ${String(matching.length).padStart(11)}   ${String(slowCount).padStart(4)}`,
    );
  }

  if (!smallest) {
    console.log(`
No subset selects exactly the slow withdrawals. The cohort needs a field
that is not in the suspect list.`);

    return;
  }

  const query = smallest
    .map(([field, value]) => `${field} = "${value}"`)
    .join(' and ');

  console.log(`
The smallest subset that selects exactly the slow withdrawals uses
${smallest.length} of ${suspects.length} conditions. That describes the cohort, not the cause.
Check individual traces, then the code, then change it and rerun:

  ${query}
  name = "atm.dispense" and duration > 500`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
