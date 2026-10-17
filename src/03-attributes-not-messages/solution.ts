/**
 * Part 3: Our solution: the facts go on the span
 *
 *   pnpm sol 03
 */
// check: name = "atm.withdraw"
// check: atm.branch = "bridge-street"
// check: user.id = "u_007"
import { init, trace, ctx, shutdown } from 'autotel';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  users,
  resetBalances,
} from '../bank/index.ts';

init({ service: 'atm', devtools: true });

interface Machine {
  id: string;
  model: string;
  branch: string;
}

const withdraw = trace(
  'atm.withdraw',
  async (
    machine: Machine,
    cardNumber: string,
    pin: string,
    amountPence: number,
  ) => {
    // `ctx` is ambient: it resolves to whichever span is active right here, so
    // nothing has to be threaded through the signature.
    ctx.setAttributes({
      'atm.id': machine.id,
      'atm.model': machine.model,
      'atm.branch': machine.branch,
      'withdrawal.amount_pence': amountPence,
    });

    const user = await findUserByCard(cardNumber);
    ctx.setAttribute('user.id', user.id);

    await verifyPin(cardNumber, pin);

    const account = await getAccount(user.id);
    ctx.setAttributes({
      'account.id': account.id,
      'account.balance_pence': account.balancePence,
    });

    const receipt = await debit(account, amountPence);
    ctx.setAttribute('withdrawal.transaction_id', receipt.transactionId);

    return receipt;
  },
);

const MACHINES: Machine[] = [
  { id: 'atm_0431', model: 'NCR-6622', branch: 'bridge-street' },
  { id: 'atm_0912', model: 'NCR-6622', branch: 'kings-cross' },
  { id: 'atm_1180', model: 'Diebold-522', branch: 'bridge-street' },
];

async function main() {
  resetBalances();

  await Promise.all(
    users
      .slice(0, 9)
      .map((user, index) =>
        withdraw(
          MACHINES[index % MACHINES.length]!,
          user.cardNumber,
          '1234',
          (index + 1) * 2000,
        ),
      ),
  );

  await shutdown();

  console.log(`
9 withdrawals traced. In the devtools search box, try:

  atm.branch = "bridge-street"
  name = "atm.withdraw" and duration > 100
  user.id = "u_007"

None of those queries were written into the code. That is the point.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
