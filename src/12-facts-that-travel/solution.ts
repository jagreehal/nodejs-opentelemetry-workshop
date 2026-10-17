/**
 * Part 12: Our solution: put the fact in baggage, once
 *
 *   pnpm sol 12
 */
// check: name = "atm.withdraw"
// check: service = accounts-service and atm.branch = "canada-water"
// check: autotel.debug = "part-10"
import {
  init,
  trace,
  ctx,
  getRequestLogger,
  shutdown,
  AUTOTEL_DEBUG_BAGGAGE_KEY,
} from 'autotel';
import { injectTraceContext } from 'autotel/http';
import {
  startServices,
  stopServices,
  jsonOrThrow,
  okOrThrow,
  type CardReply,
  type AccountReply,
  type DebitReply,
} from '../11-one-trace-three-services/harness.ts';
import { users, resetBalances } from '../bank/index.ts';

init({
  service: 'atm',
  devtools: true,
  // Copy baggage onto spans with no prefix, the same as the two services do.
  baggage: '',
});

const AUTH = 'http://127.0.0.1:7401';

const ACCOUNTS = 'http://127.0.0.1:7402';

const MACHINES = [
  { id: 'atm_0431', branch: 'bridge-street' },
  { id: 'atm_1330', branch: 'canada-water' },
];

const withdraw = trace(
  'atm.withdraw',
  async (
    machine: { id: string; branch: string },
    cardNumber: string,
    amountPence: number,
    debugLabel?: string,
  ) => {
    const log = getRequestLogger();

    // Baggage, not an attribute. An attribute stays on this span; baggage rides
    // the `baggage` header to every service this request reaches, and
    // `baggage: ''` in each init() copies it onto their spans too.
    ctx.setBaggage('atm.id', machine.id);
    ctx.setBaggage('atm.branch', machine.branch);

    // Full fidelity for one request, decided per request rather than per deploy.
    if (debugLabel) ctx.setBaggage(AUTOTEL_DEBUG_BAGGAGE_KEY, debugLabel);

    log.set({ withdrawal: { amount_pence: amountPence } });

    // injectTraceContext writes `traceparent` and `baggage` together.
    const headers = injectTraceContext();

    const user = await jsonOrThrow<CardReply>(
      await fetch(`${AUTH}/card`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ card: cardNumber }),
      }),
    );

    await okOrThrow(
      await fetch(`${AUTH}/verify`, {
        method: 'POST',
        body: JSON.stringify({ card: cardNumber, pin: '1234' }),
        headers,
      }),
    );

    const account = await jsonOrThrow<AccountReply>(
      await fetch(`${ACCOUNTS}/account?userId=${user.id}`, { headers }),
    );

    const receipt = await jsonOrThrow<DebitReply>(
      await fetch(
        `${ACCOUNTS}/debit?userId=${user.id}&amountPence=${amountPence}`,
        { method: 'POST', headers },
      ),
    );

    log.set({
      account: { id: account.id },
      withdrawal: { result: 'dispensed' },
    });
    log.emitNow();

    return { receipt, headers };
  },
);

async function main() {
  resetBalances();
  await startServices('./services-propagated', 7401, 7402);

  let lastHeaders: Record<string, string> = {};

  for (let index = 0; index < 6; index += 1) {
    const result = await withdraw(
      MACHINES[index % 2]!,
      users[index]!.cardNumber,
      5_000,
      // One withdrawal is marked for full fidelity. In production this comes
      // from a gateway, a feature flag, or a curl with an extra header.
      index === 3 ? 'part-10' : undefined,
    );

    lastHeaders = result.headers;
  }

  await stopServices(7401, 7402);
  await shutdown();

  console.log(`
The headers on the last hop:

  traceparent: ${lastHeaders['traceparent']}
  baggage:     ${lastHeaders['baggage']}

Now the query the exercise could not answer:

  service = accounts-service and atm.branch = "canada-water"

And the withdrawal that asked to be kept whatever the sampler decides:

  autotel.debug = "part-10"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
