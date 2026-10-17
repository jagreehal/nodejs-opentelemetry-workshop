/**
 * Part 4: Which work deserves a span
 *
 * One span per withdrawal tells you a withdrawal was slow. It does not tell you
 * which part of it was slow, and that is the question you actually have.
 *
 * Six operations run inside a withdrawal. Decide which of them get their own
 * span, then wrap those and only those.
 *
 *   1. verifyPin: checks the PIN, counts failures, can lock the card
 *   2. findUserByCard: looks the customer up
 *   3. getAccount: looks the account up
 *   4. debit: moves the money
 *   5. chooseNotes: arithmetic over four denominations
 *   6. formatPence: turns 4000 into "£40.00"
 *
 *   pnpm ex 04
 */
// check: name = "atm.withdraw"
import { init, trace, ctx, shutdown } from 'autotel';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
} from '../bank/index.ts';

init({ service: 'atm', devtools: true });

const DENOMINATIONS = [5000, 2000, 1000, 500] as const;

/** Greedy note selection. Pure arithmetic over a four-element array. */
function chooseNotes(amountPence: number): number[] {
  const notes: number[] = [];
  let remaining = amountPence;

  for (const note of [...DENOMINATIONS].sort((a, b) => b - a)) {
    while (remaining >= note) {
      notes.push(note);
      remaining -= note;
    }
  }

  return notes;
}

const formatPence = (pence: number) => `£${(pence / 100).toFixed(2)}`;

// TODO: give a span to the operations that earn one, and to nothing else.
const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    ctx.setAttribute('withdrawal.amount_pence', amountPence);

    const user = await findUserByCard(cardNumber);
    await verifyPin(cardNumber, pin);
    const account = await getAccount(user.id);
    const receipt = await debit(account, amountPence);

    const notes = chooseNotes(amountPence);
    console.log(
      `dispensing ${formatPence(amountPence)} as ${notes.length} notes`,
    );

    return receipt;
  },
);

async function main() {
  resetBalances();
  await Promise.all(
    users
      .slice(0, 8)
      .map((user, index) =>
        withdraw(user.cardNumber, '1234', (index + 1) * 2000),
      ),
  );
  await shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
