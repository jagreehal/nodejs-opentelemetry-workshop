/**
 * Part 11: Our solution: inject on the way out, extract on the way in
 *
 *   pnpm sol 11
 */
// check: name = "atm.withdraw"
// check: name = "accounts.debit"
// check: service = auth-service
import { init, trace, ctx, getRequestLogger, shutdown } from 'autotel';
import { injectTraceContext } from 'autotel/http';
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

const AUTH = 'http://127.0.0.1:7201';

const ACCOUNTS = 'http://127.0.0.1:7202';

let shownHeader = false;

const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    const log = getRequestLogger();
    log.set({ withdrawal: { amount_pence: amountPence } });
    console.log(`[atm]              trace ${ctx.traceId}`);

    // `injectTraceContext()` writes the W3C `traceparent` header (and baggage,
    // in part 12) describing the span that is active right now.
    const headers = injectTraceContext();

    if (!shownHeader) {
      shownHeader = true;
      console.log(`                   traceparent: ${headers['traceparent']}`);
    }

    const user = await jsonOrThrow<CardReply>(
      await fetch(`${AUTH}/card`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ card: cardNumber }),
      }),
    );

    log.set({ user: { id: user.id } });

    await okOrThrow(
      await fetch(`${AUTH}/verify`, {
        method: 'POST',
        body: JSON.stringify({ card: cardNumber, pin }),
        headers,
      }),
    );

    const account = await jsonOrThrow<AccountReply>(
      await fetch(`${ACCOUNTS}/account?userId=${user.id}`, { headers }),
    );

    log.set({ account: { id: account.id, shard: account.shard } });

    const receipt = await jsonOrThrow<DebitReply>(
      await fetch(
        `${ACCOUNTS}/debit?userId=${user.id}&amountPence=${amountPence}`,
        { method: 'POST', headers },
      ),
    );

    log.set({ withdrawal: { result: 'dispensed' } });
    log.emitNow();

    return receipt;
  },
);

async function main() {
  resetBalances();
  await startServices('./services-propagated', 7201, 7202);

  for (let index = 0; index < 3; index += 1) {
    await withdraw(users[index]!.cardNumber, '1234', 5_000);
  }

  await stopServices(7201, 7202);
  await shutdown();

  console.log(`
Three services print the same trace id per withdrawal. In devtools, open one
trace: atm.withdraw on top, auth and accounts spans nested underneath, three
service names in one waterfall.

  name = "atm.withdraw"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
