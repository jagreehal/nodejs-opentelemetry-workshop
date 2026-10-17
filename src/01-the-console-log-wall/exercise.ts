/**
 * Part 1: The console.log wall
 *
 * Five customers withdraw cash at the same moment. This is the instrumentation
 * you already have. Run it, then try to answer the question in the README.
 *
 *   pnpm ex 01
 */
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
} from '../bank/index.ts';

async function withdraw(cardNumber: string, pin: string, amountPence: number) {
  console.log('withdrawal started');

  const user = await findUserByCard(cardNumber);
  console.log('user found:', user.name);

  await verifyPin(cardNumber, pin);
  console.log('pin ok');

  const account = await getAccount(user.id);
  console.log('account found, balance', account.balancePence);

  const receipt = await debit(account, amountPence);
  console.log('debited, new balance', receipt.balancePence);

  console.log('withdrawal complete');

  return receipt;
}

async function main() {
  resetBalances();

  // Five machines, five customers, one process. Exactly as it is in production,
  // where nothing waits its turn.
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
