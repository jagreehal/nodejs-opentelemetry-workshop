/**
 * Part 6: Our solution: set up first, then load the app
 *
 *   pnpm sol 06
 */
// import: ./instrumentation.ts
// check: name = "atm.withdraw"
// check-log: pin ok
import pino from 'pino';
import { trace, shutdown } from 'autotel';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
} from '../bank/index.ts';

// No init() here. instrumentation.ts ran before this file loaded, so the Pino
// imported above is already the patched one.
const logger = pino();

const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    logger.info({ amountPence }, 'withdrawal started');

    const user = await findUserByCard(cardNumber);

    logger.info({ userId: user.id }, 'user found');
    await verifyPin(cardNumber, pin);
    logger.info('pin ok');

    const account = await getAccount(user.id);
    const receipt = await debit(account, amountPence);

    logger.info({ transactionId: receipt.transactionId }, 'debited');

    return receipt;
  },
);

async function main() {
  resetBalances();
  await Promise.all(
    users
      .slice(0, 5)
      .map((user, index) =>
        withdraw(user.cardNumber, '1234', (index + 1) * 2000),
      ),
  );

  await shutdown();

  console.log(`
Every line above now carries trace_id and span_id. Pick one trace_id and paste
it into the devtools search box:

  trace_id = "<a trace_id from above>"

The trace opens with its log lines attached, in order, under the span that
wrote each one.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
