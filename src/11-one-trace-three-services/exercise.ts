/**
 * Part 11: One trace, three services
 *
 * Nothing about the withdrawal changed. The four steps that used to be
 * function calls are now HTTP calls to two other processes, each with its own
 * init() and its own service name.
 *
 * TODO: run it, look at devtools, and work out why one withdrawal is now three
 *       unrelated traces, then make it one again.
 *
 *   pnpm ex 11
 */
// check: name = "atm.withdraw"
import { init, trace, ctx, getRequestLogger, shutdown } from 'autotel';
import {
  startServices,
  stopServices,
  jsonOrThrow,
  okOrThrow,
  type CardReply,
  type AccountReply,
  type DebitReply,
} from './harness.ts';
import { users, resetBalances } from '../bank/index.ts';

init({ service: 'atm', devtools: true });

const AUTH = 'http://127.0.0.1:7101';

const ACCOUNTS = 'http://127.0.0.1:7102';

const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    const log = getRequestLogger();
    log.set({ withdrawal: { amount_pence: amountPence } });
    console.log(`[atm]              trace ${ctx.traceId}`);

    const user = await jsonOrThrow<CardReply>(
      await fetch(`${AUTH}/card`, {
        method: 'POST',
        body: JSON.stringify({ card: cardNumber }),
      }),
    );

    log.set({ user: { id: user.id } });

    await okOrThrow(
      await fetch(`${AUTH}/verify`, {
        method: 'POST',
        body: JSON.stringify({ card: cardNumber, pin }),
      }),
    );

    const account = await jsonOrThrow<AccountReply>(
      await fetch(`${ACCOUNTS}/account?userId=${user.id}`),
    );

    log.set({ account: { id: account.id, shard: account.shard } });

    const receipt = await jsonOrThrow<DebitReply>(
      await fetch(
        `${ACCOUNTS}/debit?userId=${user.id}&amountPence=${amountPence}`,
        { method: 'POST' },
      ),
    );

    log.set({ withdrawal: { result: 'dispensed' } });
    log.emitNow();

    return receipt;
  },
);

async function main() {
  resetBalances();
  await startServices('./services', 7101, 7102);

  for (let index = 0; index < 3; index += 1) {
    await withdraw(users[index]!.cardNumber, '1234', 5_000);
  }

  await stopServices(7101, 7102);
  await shutdown();

  console.log(`
3 withdrawals. Now look at devtools and count the traces.

  service = atm
  service = auth-service
  service = accounts-service

Each of those has its own traces, and none of them contains the others.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
