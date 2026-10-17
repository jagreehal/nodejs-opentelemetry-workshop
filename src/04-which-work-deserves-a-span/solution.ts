/**
 * Part 4: Our solution: four spans, not six
 *
 *   pnpm sol 04
 */
// check: name = "atm.withdraw"
// check: name = "bank.debit"
// check: name = "bank.verify_pin"
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

// `trace(name, fn)` wraps a function you did not write. The bank modules stay
// free of instrumentation; the seam is here, at the point of use.
const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

const DENOMINATIONS = [5000, 2000, 1000, 500] as const;

/** No span: sub-millisecond, cannot fail, nothing to group by. */
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

/** No span either. It is a `toFixed` call. */
const formatPence = (pence: number) => `£${(pence / 100).toFixed(2)}`;

const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    ctx.setAttribute('withdrawal.amount_pence', amountPence);

    const user = await tracedFindUser(cardNumber);
    await tracedVerifyPin(cardNumber, pin);
    const account = await tracedGetAccount(user.id);

    // The interesting one. Money moved, so the span carries what moved.
    const receipt = await tracedDebit(account, amountPence);
    ctx.setAttributes({
      'account.id': account.id,
      'withdrawal.transaction_id': receipt.transactionId,
    });

    // The two operations without spans still leave a trace: their result is an
    // attribute on the span that is already here.
    const notes = chooseNotes(amountPence);
    ctx.setAttributes({
      'withdrawal.note_count': notes.length,
      'withdrawal.display_amount': formatPence(amountPence),
    });

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

  console.log(`
8 withdrawals, 5 spans each. Open one trace in devtools: the waterfall now says
where the time went. Compare the u_007 trace with any other one.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
