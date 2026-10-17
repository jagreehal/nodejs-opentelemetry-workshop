/**
 * Part 9: Our solution: two instruments, recorded once per withdrawal
 *
 *   pnpm sol 09
 */
// check: name = "atm.withdraw"
// check-metric: atm.withdraw.duration
// check-metric: atm.withdrawals
import {
  init,
  trace,
  getRequestLogger,
  createHistogram,
  createCounter,
  shutdown,
} from 'autotel';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  isBankError,
  users,
  resetBalances,
} from '../bank/index.ts';

init({ service: 'atm', devtools: true });

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

interface Machine {
  id: string;
  model: string;
  branch: string;
}

const MACHINES: Machine[] = [
  { id: 'atm_0431', model: 'NCR-6622', branch: 'bridge-street' },
  { id: 'atm_0912', model: 'NCR-6622', branch: 'kings-cross' },
  { id: 'atm_1180', model: 'Diebold-522', branch: 'bridge-street' },
  { id: 'atm_1204', model: 'Diebold-522', branch: 'canada-water' },
  { id: 'atm_1330', model: 'Wincor-2100', branch: 'canada-water' },
];

// A histogram keeps a count per time range (a bucket), not each duration.
const duration = createHistogram('atm.withdraw.duration', {
  unit: 'ms',
  description: 'How long each withdrawal took, start to finish',
});

// A counter only goes up. The dashboard turns it into withdrawals per minute.
const withdrawals = createCounter('atm.withdrawals', {
  description: 'Withdrawals, by branch and result',
});

const withdraw = trace(
  'atm.withdraw',
  async (machine: Machine, cardNumber: string, amountPence: number) => {
    const log = getRequestLogger();
    const startedAt = performance.now();
    let result = 'refused';
    log.set({
      atm: { id: machine.id, model: machine.model, branch: machine.branch },
      withdrawal: { amount_pence: amountPence },
    });

    try {
      const user = await tracedFindUser(cardNumber);
      log.set({ user: { id: user.id } });
      await tracedVerifyPin(cardNumber, '1234');

      const account = await tracedGetAccount(user.id);
      log.set({ account: { id: account.id } });

      const receipt = await tracedDebit(account, amountPence);
      log.set({ withdrawal: { result: 'dispensed' } });
      result = 'dispensed';

      return receipt;
    } catch (error) {
      log.set({
        withdrawal: {
          result: 'refused',
          refusal_code: isBankError(error) ? error.code : 'UNEXPECTED',
        },
      });
      throw error;
    } finally {
      log.emitNow();

      // Labels are the only way to split a metric later, and each distinct
      // combination becomes its own series. Branch and result have a handful
      // of values between them. A user id here would mean one series per
      // customer.
      duration.record(performance.now() - startedAt, {
        'atm.branch': machine.branch,
      });
      withdrawals.add(1, {
        'atm.branch': machine.branch,
        'withdrawal.result': result,
      });
    }
  },
);

async function main() {
  resetBalances();

  // Ten machines busy at once, so 200 withdrawals take two seconds rather than
  // twenty. The estate is not polite enough to queue either.
  for (let start = 0; start < 200; start += 10) {
    await Promise.all(
      Array.from({ length: 10 }, (_, offset) => start + offset).map((index) => {
        const machine = MACHINES[index % MACHINES.length]!;
        const user = users[index % users.length]!;
        const amountPence = 1000 + (index % 4) * 500;

        return withdraw(machine, user.cardNumber, amountPence).catch(() => {
          /* refusals are expected; part 7 covered them */
        });
      }),
    );
  }

  await shutdown();

  console.log(`
200 withdrawals, two metrics. Open devtools' Metrics view:

  atm.withdraw.duration   one series per branch
  atm.withdrawals         one series per branch and result

Compare the branches. Two of them look slow. Part 10 asks whether they are.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
