/**
 * Part 10: Our solution: record the shard, then let the data rank itself
 *
 *   pnpm sol 10
 */
// check: name = "atm.withdraw"
// check: account.shard = "legacy-core"
// check: name = "atm.withdraw" and duration > 200
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

init({ service: 'atm', devtools: true });

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

interface Machine {
  id: string;
  model: string;
  branch: string;
}

const MACHINES: Machine[] = [
  { id: 'atm_0431', model: 'NCR-6622', branch: 'bridge-street' },
  { id: 'atm_0912', model: 'NCR-6622', branch: 'kings-cross' },
  { id: 'atm_1180', model: 'Diebold-522', branch: 'bridge-street' },
  { id: 'atm_1204', model: 'Diebold-522', branch: 'canada-water' },
  { id: 'atm_1330', model: 'Wincor-2100', branch: 'canada-water' },
];

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
      // Raw amounts never repeat often enough to describe a group, so the
      // bucket is what makes the number groupable at all.
      'withdrawal.amount_band': bucket(amountPence, [1000, 2000, 5000]),
    };

    log.set({
      atm: { id: machine.id, model: machine.model, branch: machine.branch },
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
      // The field that was missing. It is a property of the account, not of the
      // request, which is exactly why nobody thought to record it.
      fields['account.shard'] = account.shard;
      log.set({ account: { id: account.id, shard: account.shard } });

      const receipt = await tracedDebit(account, amountPence);
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

async function main() {
  resetBalances();

  // Ten machines busy at once, so 200 withdrawals take two seconds rather than
  // twenty. The estate is not polite enough to queue either.
  for (let start = 0; start < 200; start += 10) {
    await Promise.all(
      Array.from({ length: 10 }, (_, offset) => start + offset).map((index) => {
        const machine = MACHINES[index % MACHINES.length]!;
        const user = users[index % users.length]!;
        const amountPence = 1000 + (index % 4) * 500;

        return withdraw(machine, user.cardNumber, amountPence).catch(() => {
          /* refusals are expected */
        });
      }),
    );
  }

  await shutdown();

  // Step 2 of the core analysis loop: name the group that looks wrong.
  const slow = observed.filter((event) => event.durationMs > 200);
  const normal = observed.filter((event) => event.durationMs <= 200);

  // Step 3, which is the part worth automating: what separates them?
  const differences = compareCohorts({
    outlier: slow,
    baseline: normal,
    ignoreFields: ['durationMs'],
  });

  console.log(
    `\n${slow.length} slow of ${observed.length}. What separates them:\n`,
  );
  console.log(
    '  field                        value          in slow   in normal',
  );

  for (const d of differences.slice(0, 6)) {
    console.log(
      `  ${d.field.padEnd(28)} ${d.value.padEnd(14)} ${(d.outlierFraction * 100).toFixed(0).padStart(6)}%   ${(d.baselineFraction * 100).toFixed(0).padStart(7)}%`,
    );
  }

  console.log(`
The top row is the answer, and it is a field the exercise never recorded.
Confirm it against individual traces before believing it:

  account.shard = "legacy-core"
  name = "atm.withdraw" and duration > 200`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
