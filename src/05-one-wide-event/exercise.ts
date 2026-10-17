/**
 * Part 5: One wide event per request
 *
 * Two withdrawals in here fail on the daily limit. To explain one of them you
 * need the branch and the balance (attributes on the parent span) and the
 * refusal code, which exists only inside the exception a child span threw.
 *
 * TODO: emit one event per withdrawal carrying everything the withdrawal knew,
 *       so that answering "which customers hit the daily limit at bridge-street"
 *       is one filter and not a join.
 *
 *   pnpm ex 05
 */
// check: name = "atm.withdraw"
import { init, trace, ctx, shutdown } from 'autotel';
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
    ctx.setAttributes({
      'atm.branch': branch,
      'withdrawal.amount_pence': amountPence,
    });

    const user = await tracedFindUser(cardNumber);
    ctx.setAttribute('user.id', user.id);

    await tracedVerifyPin(cardNumber, pin);

    const account = await tracedGetAccount(user.id);
    ctx.setAttribute('account.balance_pence', account.balancePence);

    const receipt = await tracedDebit(account, amountPence);

    return receipt;
  },
);

async function attempt(index: number, amountPence: number) {
  const user = users[index]!;
  const branch = BRANCHES[index % BRANCHES.length]!;

  try {
    await withdraw(branch, user.cardNumber, '1234', amountPence);
  } catch (error) {
    if (!isBankError(error)) throw error;
    console.log(`refused: ${user.id} ${error.code}`);
  }
}

async function main() {
  resetBalances();

  for (let index = 0; index < 8; index += 1) await attempt(index, 10_000);
  // Two customers come back for more and hit the £300 daily limit.
  await attempt(0, 25_000);
  await attempt(3, 25_000);

  await shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
