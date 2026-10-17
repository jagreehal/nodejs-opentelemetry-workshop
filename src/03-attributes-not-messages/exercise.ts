/**
 * Part 3: Attributes, not messages
 *
 * Every trace here is named `atm.withdraw` and most last about 70ms. They are
 * indistinguishable. Support wants to know whether the slow withdrawals come
 * from one machine, one model or one branch, and nothing in this data can
 * answer that.
 *
 * TODO: put the facts of the withdrawal on the span instead of into strings,
 *       then answer the three questions in the README from the devtools search
 *       box rather than by reading code.
 *
 *   pnpm ex 03
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
    console.log(`withdrawal at ${machine.id} (${machine.model})`);

    const user = await findUserByCard(cardNumber);
    console.log(`customer ${user.name}`);

    await verifyPin(cardNumber, pin);

    const account = await getAccount(user.id);
    console.log(`account ${account.id}, balance ${account.balancePence}p`);

    const receipt = await debit(account, amountPence);
    console.log(`dispensed ${amountPence}p, txn ${receipt.transactionId}`);

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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
