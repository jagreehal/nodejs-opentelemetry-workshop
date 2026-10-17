/**
 * Part 12: Facts that travel
 *
 * One trace, three services. Part 10's method works again, right up to the
 * moment you try to group the accounts service by branch.
 *
 * The ATM knows which machine and which branch. The accounts service does not,
 * and no function signature between them carries it.
 *
 * TODO: make `atm.branch` and `atm.id` available on every span in every
 *       service, without adding a parameter to anything.
 *
 *   pnpm ex 12
 */
// check: name = "atm.withdraw"
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
} from '../11-one-trace-three-services/harness.ts';
import { users, resetBalances } from '../bank/index.ts';

init({ service: 'atm', devtools: true });

const AUTH = 'http://127.0.0.1:7301';

const ACCOUNTS = 'http://127.0.0.1:7302';

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
  ) => {
    const log = getRequestLogger();
    // These two facts exist here and nowhere else.
    ctx.setAttributes({ 'atm.id': machine.id, 'atm.branch': machine.branch });
    log.set({ withdrawal: { amount_pence: amountPence } });

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

    return receipt;
  },
);

async function main() {
  resetBalances();
  await startServices('./services-propagated', 7301, 7302);

  for (let index = 0; index < 6; index += 1) {
    await withdraw(MACHINES[index % 2]!, users[index]!.cardNumber, 5_000);
  }

  await stopServices(7301, 7302);
  await shutdown();

  console.log(`
6 withdrawals. Now try this in devtools:

  service = accounts-service and atm.branch = "canada-water"

Nothing. The accounts service has never heard of a branch.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
