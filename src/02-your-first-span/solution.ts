/**
 * Part 2: Our solution: init once, wrap once, flush at the end
 *
 *   pnpm devtools     # in another terminal
 *   pnpm sol 02       # then look at http://127.0.0.1:4318
 */
// check: name = "atm.withdraw"
import { init, trace, shutdown } from 'autotel';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
} from '../bank/index.ts';

// One synchronous call, once per process, before any traced code runs.
// `devtools: true` points the exporter at http://127.0.0.1:4318, which is the
// receiver `pnpm devtools` is running.
init({
  service: 'atm',
  devtools: true,
});

// `trace(name, fn)` returns a wrapped function. It runs nothing by itself, so a
// call at module load can never start work by accident.
const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    const user = await findUserByCard(cardNumber);
    await verifyPin(cardNumber, pin);
    const account = await getAccount(user.id);

    return debit(account, amountPence);
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

  // Spans are batched. Without this the process exits with the batch unsent,
  // which looks exactly like instrumentation that does not work.
  await shutdown();

  console.log('5 withdrawals traced → http://127.0.0.1:4318');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
