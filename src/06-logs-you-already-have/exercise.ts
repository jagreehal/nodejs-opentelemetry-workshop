/**
 * Part 6: Logs you already have
 *
 * The bank's code already logs with Pino, and nobody is going to delete four
 * hundred log lines to adopt tracing. This file turns the Pino instrumentation
 * on in its first statement, and still no log line carries a trace id.
 *
 * TODO: make every Pino line carry the trace_id and span_id of the withdrawal
 *       that wrote it, without adding either field by hand.
 *
 *   pnpm ex 06
 */
// check: name = "atm.withdraw"
import pino from 'pino';
import { init, trace, shutdown } from 'autotel';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
} from '../bank/index.ts';

// The first statement in the file. Pino has already been imported by now.
init({
  service: 'atm',
  devtools: true,
  instrumentations: [new PinoInstrumentation()],
});

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

  // Part 1's five machines, logging into one stream again.
  await Promise.all(
    users
      .slice(0, 5)
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
