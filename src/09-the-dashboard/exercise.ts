/**
 * Part 9: The dashboard
 *
 * Before anyone can investigate slow withdrawals, someone has to notice them.
 * Operations want a chart of withdrawal time per branch and a count of
 * withdrawals by outcome, kept for a year, at a cost that does not grow with
 * traffic. The spans here are too detailed and too expensive to keep that long.
 *
 * TODO: record a histogram of how long each withdrawal took, split by branch,
 *       and a counter of withdrawals, split by branch and result.
 *
 *   pnpm ex 09
 */
// check: name = "atm.withdraw"
import { init, trace, getRequestLogger, shutdown } from 'autotel';
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

const withdraw = trace(
  'atm.withdraw',
  async (machine: Machine, cardNumber: string, amountPence: number) => {
    const log = getRequestLogger();
    log.set({
      atm: { id: machine.id, model: machine.model, branch: machine.branch },
      withdrawal: { amount_pence: amountPence },
    });

    try {
      const user = await tracedFindUser(cardNumber);
      log.set({ user: { id: user.id } });
      await tracedVerifyPin(cardNumber, '1234');

      const account = await tracedGetAccount(user.id);
      log.set({ account: { id: account.id } });

      const receipt = await tracedDebit(account, amountPence);
      log.set({ withdrawal: { result: 'dispensed' } });

      return receipt;
    } catch (error) {
      log.set({
        withdrawal: {
          result: 'refused',
          refusal_code: isBankError(error) ? error.code : 'UNEXPECTED',
        },
      });
      throw error;
    } finally {
      log.emitNow();
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
          /* refusals are expected; part 7 covered them */
        });
      }),
    );
  }

  await shutdown();

  console.log(`
200 withdrawals sent, and nothing in devtools' Metrics view yet. Operations
want two charts: time per branch, and withdrawals by branch and result.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
