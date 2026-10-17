/**
 * Part 2: Your first span
 *
 * This is where part 1 left you: ids and JSON, maintained by hand.
 *
 * TODO 1: call init() once, at the top, before anything else runs.
 * TODO 2: wrap withdraw() so each call becomes one span.
 * TODO 3: flush before the process exits, or the spans die with it.
 *
 *   pnpm devtools     # in another terminal, left open all workshop
 *   pnpm ex 02        # then look at http://127.0.0.1:4318
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
  await verifyPin(cardNumber, pin);
  const account = await getAccount(user.id);
  const receipt = await debit(account, amountPence);

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
