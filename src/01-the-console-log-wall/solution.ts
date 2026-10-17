/**
 * Part 1: Our solution: give every withdrawal an id, and log key-values
 *
 * No library yet. This is what you would write yourself once the interleaved
 * output beat you, and it is worth writing because of what it still cannot do.
 *
 *   pnpm sol 01
 */
import { randomUUID } from 'node:crypto';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
} from '../bank/index.ts';

/** The facts a line can carry. Named fields, so a typo fails to compile. */
interface LogFields {
  amountPence?: number;
  userId?: string;
  accountId?: string;
  transactionId?: string;
  durationMs?: number;
}

/** One line, one JSON object, one id tying the object to its withdrawal. */
function log(withdrawalId: string, event: string, fields: LogFields = {}) {
  console.log(
    JSON.stringify({ t: Date.now(), withdrawalId, event, ...fields }),
  );
}

async function withdraw(cardNumber: string, pin: string, amountPence: number) {
  const withdrawalId = randomUUID().slice(0, 8);
  const startedAt = Date.now();
  log(withdrawalId, 'withdrawal.started', { amountPence });

  const user = await findUserByCard(cardNumber);
  log(withdrawalId, 'user.found', { userId: user.id });

  await verifyPin(cardNumber, pin);
  log(withdrawalId, 'pin.verified');

  const account = await getAccount(user.id);
  log(withdrawalId, 'account.found', { accountId: account.id });

  const receipt = await debit(account, amountPence);
  log(withdrawalId, 'account.debited', {
    transactionId: receipt.transactionId,
  });

  log(withdrawalId, 'withdrawal.completed', {
    durationMs: Date.now() - startedAt,
  });

  return receipt;
}

async function main() {
  resetBalances();
  await Promise.all(
    users
      .slice(0, 5)
      .map((user, index) =>
        withdraw(user.cardNumber, '1234', (index + 1) * 2000),
      ),
  );

  console.log(`
Now you can grep one withdrawal out of the noise:

  pnpm sol 01 | grep <withdrawalId>

Four things this still will not tell you:

  1. How long verifyPin took. You timed the whole withdrawal, not its parts.
  2. Which step was slow when one withdrawal is slow.
  3. What happened when the process died before the last line was written.
  4. Anything at all once the debit moves to another service.

Every one of those is fixed by the same change, and you have already written
most of it. Part 2.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
