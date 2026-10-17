/**
 * Part 8: The questions the business asks
 *
 * Three questions arrived this week, none of them from an engineer:
 *
 *   1. How much cash left the estate at bridge-street yesterday?
 *   2. Of the customers we refused on the daily limit, how many had the money?
 *   3. When we refuse someone, do they try again for a smaller amount?
 *
 * Question 2 you can already answer, from part 5. The other two are about what
 * people did, they are asked every week, and the person asking does not have a
 * devtools tab.
 *
 * TODO: emit a business event for each completed and each refused withdrawal,
 *       and send it somewhere the product team could actually read.
 *
 *   pnpm ex 08
 */
// check: name = "atm.withdraw"
import { init, trace, getRequestLogger, shutdown } from 'autotel';
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

    try {
      const user = await tracedFindUser(cardNumber);
      log.set({ user: { id: user.id } });
      await tracedVerifyPin(cardNumber, pin);

      const account = await tracedGetAccount(user.id);
      const receipt = await tracedDebit(account, amountPence);
      log.set({ withdrawal: { result: 'dispensed' } });

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
    }
  },
);

async function attempt(index: number, branch: string, amountPence: number) {
  try {
    await withdraw(branch, users[index]!.cardNumber, '1234', amountPence);
  } catch {
    /* refused; the event above already recorded why */
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

  // Customer 0 comes back for too much, is refused, and tries again smaller.
  await attempt(0, 'bridge-street', 25_000);
  await attempt(0, 'bridge-street', 15_000);

  await shutdown();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
