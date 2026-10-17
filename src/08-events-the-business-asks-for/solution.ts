/**
 * Part 8: Our solution: track() alongside the span, not instead of it
 *
 *   pnpm sol 08
 */
// check: name = "atm.withdraw"
// check: withdrawal.result = "dispensed"
import { readFileSync, rmSync } from 'node:fs';
import { init, trace, track, getRequestLogger, flush, shutdown } from 'autotel';
import { FileSubscriber } from 'autotel-subscribers/file';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  isBankError,
  users,
  resetBalances,
} from '../bank/index.ts';

const EVENTS_FILE = new URL('./events.ndjson', import.meta.url).pathname;

rmSync(EVENTS_FILE, { force: true });

init({
  service: 'atm',
  devtools: true,
  // Where business events go. In production this is PostHog, Mixpanel,
  // Amplitude, Segment or your own webhook; the `track()` calls do not change.
  subscribers: [new FileSubscriber({ path: EVENTS_FILE })],
});

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

const withdraw = trace(
  'atm.withdraw',
  async (
    branch: string,
    cardNumber: string,
    pin: string,
    amountPence: number,
  ) => {
    const log = getRequestLogger();
    log.set({ atm: { branch }, withdrawal: { amount_pence: amountPence } });

    // Hoisted so the refusal event can name the customer too. Without it,
    // "do refused customers come back?" has nothing to join on.
    let userId: string | undefined;

    try {
      const user = await tracedFindUser(cardNumber);
      userId = user.id;
      log.set({ user: { id: user.id } });
      await tracedVerifyPin(cardNumber, pin);

      const account = await tracedGetAccount(user.id);
      const receipt = await tracedDebit(account, amountPence);
      log.set({ withdrawal: { result: 'dispensed' } });

      // The business event. Named for what happened in the world, not for what
      // the code did, and carrying the numbers a product person would group by.
      track('atm.cash_withdrawn', {
        'user.id': user.id,
        'atm.branch': branch,
        'withdrawal.amount_pence': amountPence,
        'account.balance_after_pence': receipt.balancePence,
      });

      return receipt;
    } catch (error) {
      const code = isBankError(error) ? error.code : 'UNEXPECTED';
      log.set({ withdrawal: { result: 'refused', refusal_code: code } });

      track('atm.withdrawal_refused', {
        ...(userId && { 'user.id': userId }),
        'atm.branch': branch,
        'withdrawal.amount_pence': amountPence,
        'withdrawal.refusal_code': code,
      });

      throw error;
    } finally {
      log.emitNow();
    }
  },
);

async function attempt(index: number, branch: string, amountPence: number) {
  try {
    await withdraw(branch, users[index]!.cardNumber, '1234', amountPence);
  } catch {
    /* refused; both records above already say why */
  }
}

async function main() {
  resetBalances();

  for (let index = 0; index < 6; index += 1) {
    await attempt(
      index,
      index % 2 === 0 ? 'bridge-street' : 'kings-cross',
      10_000,
    );
  }

  await attempt(0, 'bridge-street', 25_000);
  await attempt(0, 'bridge-street', 15_000);

  // Events are queued and sent in the background, like spans.
  await flush();
  await shutdown();

  const events = readFileSync(EVENTS_FILE, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

  console.log(`\n${events.length} business events written to events.ndjson\n`);

  for (const event of events) {
    const amount = event.attributes?.['withdrawal.amount_pence'];
    console.log(
      `  ${event.name.padEnd(28)} £${((amount ?? 0) / 100).toFixed(2).padStart(7)}  trace ${event.attributes?.traceId?.slice(0, 12)}`,
    );
  }

  const refused = events.find((e) => e.name === 'atm.withdrawal_refused');
  console.log(`
Every event carries the traceId of the request that produced it. Paste this one
into the devtools search box and you land on the exact withdrawal behind the
number:

  trace_id = "${refused?.attributes?.traceId}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
