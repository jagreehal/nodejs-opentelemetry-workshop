/**
 * Part 7: Errors that explain themselves
 *
 * Five different refusals reach the screen as the same sentence. Last month
 * the call centre took 400 calls from customers the machine could have told
 * what to do.
 *
 * TODO: give each refusal a message the customer can act on, a reason, a fix,
 *       and a status the caller can branch on. Keep off the screen anything a
 *       shoulder-surfer should not see.
 *
 *   pnpm ex 07
 */
// check: name = "atm.withdraw"
import { init, trace, getRequestLogger, shutdown } from 'autotel';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
  resetAuthAttempts,
} from '../bank/index.ts';

init({ service: 'atm', devtools: true });

const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    const log = getRequestLogger();
    log.set({ withdrawal: { amount_pence: amountPence } });

    const user = await tracedFindUser(cardNumber);
    log.set({ user: { id: user.id } });

    await tracedVerifyPin(cardNumber, pin);

    const account = await tracedGetAccount(user.id);
    const receipt = await tracedDebit(account, amountPence);
    log.set({ withdrawal: { result: 'dispensed' } });
    log.emitNow();

    return receipt;
  },
);

/** What the customer standing at the machine actually sees. */
function screen(thrown: string) {
  console.log('┌──────────────────────────────────────┐');
  console.log('│ Transaction failed.                  │');
  console.log('│ Contact your bank.                   │');
  console.log('└──────────────────────────────────────┘');
  console.log(`  (thrown: ${thrown})\n`);
}

async function main() {
  resetBalances();
  resetAuthAttempts();

  const card = users[1]!.cardNumber;

  const scenarios: Array<[string, string, string, number]> = [
    ['an unknown card', '4000999999', '1234', 10_000],
    ['a wrong PIN', card, '9999', 10_000],
    ['a second wrong PIN', card, '9999', 10_000],
    ['a third wrong PIN, and the machine keeps the card', card, '9999', 10_000],
    ['more than the balance', users[2]!.cardNumber, '1234', 999_999],
    ['over the daily limit', users[3]!.cardNumber, '1234', 40_000],
  ];

  for (const [label, card, pin, amount] of scenarios) {
    console.log(`\n── ${label} ──`);

    try {
      await withdraw(card, pin, amount);
    } catch (error) {
      screen(String(error));
    }
  }

  await shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
