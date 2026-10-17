/**
 * Part 5: Our solution: one snapshot per withdrawal
 *
 *   pnpm sol 05
 */
// check: name = "atm.withdraw"
// check: withdrawal.result = "refused"
// check: withdrawal.refusal_code = "DAILY_LIMIT_EXCEEDED"
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

const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

const BRANCHES = ['bridge-street', 'kings-cross'] as const;

const withdraw = trace(
  'atm.withdraw',
  async (
    branch: string,
    cardNumber: string,
    pin: string,
    amountPence: number,
  ) => {
    // One logger for this withdrawal. It reads the active span, so it does not
    // need to be passed anywhere, and every `set` lands on the same event.
    const log = getRequestLogger();
    log.set({
      atm: { branch },
      withdrawal: { amount_pence: amountPence },
    });

    try {
      const user = await tracedFindUser(cardNumber);
      log.set({ user: { id: user.id } });

      await tracedVerifyPin(cardNumber, pin);

      const account = await tracedGetAccount(user.id);
      log.set({
        account: {
          id: account.id,
          balance_pence: account.balancePence,
          withdrawn_today_pence: account.withdrawnTodayPence,
          daily_limit_pence: account.dailyLimitPence,
        },
      });

      const receipt = await tracedDebit(account, amountPence);
      log.set({
        withdrawal: {
          result: 'dispensed',
          transaction_id: receipt.transactionId,
        },
      });

      return receipt;
    } catch (error) {
      // The refusal is a fact about the withdrawal, so it goes on the same
      // event as everything else the withdrawal knew.
      log.set({
        withdrawal: {
          result: 'refused',
          refusal_code: isBankError(error) ? error.code : 'UNEXPECTED',
        },
      });
      throw error;
    } finally {
      // One line per withdrawal, whichever way it went.
      log.emitNow();
    }
  },
);

async function attempt(index: number, amountPence: number) {
  const user = users[index]!;
  const branch = BRANCHES[index % BRANCHES.length]!;

  try {
    await withdraw(branch, user.cardNumber, '1234', amountPence);
  } catch (error) {
    if (!isBankError(error)) throw error;
  }
}

async function main() {
  resetBalances();

  for (let index = 0; index < 8; index += 1) await attempt(index, 10_000);
  await attempt(0, 25_000);
  await attempt(3, 25_000);

  await shutdown();

  console.log(`
10 withdrawals, 10 events. The question that needed three spans is now one
filter:

  withdrawal.result = "refused" and atm.branch = "bridge-street"

And the one nobody thought to ask in advance, which is the real test:

  withdrawal.refusal_code = "DAILY_LIMIT_EXCEEDED" and account.balance_pence > 40000`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
