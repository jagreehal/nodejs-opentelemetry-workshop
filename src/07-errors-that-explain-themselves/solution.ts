/**
 * Part 7: Our solution: one translation at the boundary
 *
 *   pnpm sol 07
 */
// check: name = "atm.withdraw"
// check: withdrawal.refusal_code = "CARD_RETAINED"
// check: status = ERROR
import {
  init,
  trace,
  createStructuredError,
  parseError,
  type ParsedError,
  getRequestLogger,
  shutdown,
} from 'autotel';
import {
  findUserByCard,
  verifyPin,
  getAccount,
  debit,
  isBankError,
  type BankErrorCode,
  users,
  resetBalances,
  resetAuthAttempts,
} from '../bank/index.ts';

init({ service: 'atm', devtools: true });

const tracedVerifyPin = trace('bank.verify_pin', verifyPin);

const tracedFindUser = trace('bank.find_user_by_card', findUserByCard);

const tracedGetAccount = trace('bank.get_account', getAccount);

const tracedDebit = trace('bank.debit', debit);

/**
 * One table, four rows, written once. `why` explains, `fix` is the next action,
 * `status` is what a caller branches on, `link` is where the agent on the phone
 * goes. None of them names a balance, a PIN or a card number.
 */
const REFUSALS: Record<
  BankErrorCode,
  { message: string; why: string; fix: string; status: number; link: string }
> = {
  CARD_NOT_RECOGNISED: {
    message: 'This card cannot be used here',
    why: 'The card number is not one this network recognises.',
    fix: 'Check the card is the right way round, or use a machine on your own network.',
    status: 404,
    link: 'https://bank.example/help/card-not-recognised',
  },
  PIN_INCORRECT: {
    message: 'Incorrect PIN',
    why: 'The PIN entered does not match this card.',
    fix: 'Try again. After three wrong attempts the machine keeps the card.',
    status: 401,
    link: 'https://bank.example/help/pin',
  },
  CARD_RETAINED: {
    message: 'Card retained',
    why: 'Three incorrect PINs were entered on this card.',
    fix: 'Call the number on your statement to have a replacement sent.',
    status: 423,
    link: 'https://bank.example/help/card-retained',
  },
  INSUFFICIENT_FUNDS: {
    message: 'Not enough in the account',
    why: 'The amount requested is more than the available balance.',
    fix: 'Try a smaller amount, or check for pending transactions in the app.',
    status: 402,
    link: 'https://bank.example/help/balance',
  },
  DAILY_LIMIT_EXCEEDED: {
    message: 'Daily limit reached',
    why: 'This amount would take today’s total past the £300 daily cash limit.',
    fix: 'The limit resets at midnight. Larger amounts can be arranged in branch.',
    status: 429,
    link: 'https://bank.example/help/daily-limit',
  },
  LEDGER_UNAVAILABLE: {
    message: 'The machine cannot reach your bank',
    why: 'The ledger did not answer in time. No money has left the account.',
    fix: 'Wait a minute and try again. Nothing was debited.',
    status: 503,
    link: 'https://bank.example/help/try-again',
  },
};

const withdraw = trace(
  'atm.withdraw',
  async (cardNumber: string, pin: string, amountPence: number) => {
    const log = getRequestLogger();
    log.set({ withdrawal: { amount_pence: amountPence } });

    try {
      const user = await tracedFindUser(cardNumber);
      log.set({ user: { id: user.id } });

      await tracedVerifyPin(cardNumber, pin);

      const account = await tracedGetAccount(user.id);
      const receipt = await tracedDebit(account, amountPence);
      log.set({ withdrawal: { result: 'dispensed' } });

      return receipt;
    } catch (error) {
      if (!isBankError(error)) throw error;

      const refusal = REFUSALS[error.code];
      log.set({
        withdrawal: { result: 'refused', refusal_code: error.code },
        // The domain’s own detail (attempts remaining, limits) is safe to keep
        // in telemetry and is exactly what the on-call engineer wants.
        ...error.detail,
      });

      throw createStructuredError({
        ...refusal,
        code: error.code,
        cause: error,
      });
    } finally {
      log.emitNow();
    }
  },
);

/**
 * The screen shows an error the caller already parsed, the same way any
 * client would: parseError() at the catch, then typed fields from here on.
 */
function screen(parsed: ParsedError) {
  const row = (text: string) => `│ ${text.slice(0, 56).padEnd(56)} │`;

  const details = [parsed.why, parsed.fix].flatMap((text) =>
    text ? [row(text)] : [],
  );

  console.log(
    [
      `┌${'─'.repeat(58)}┐`,
      row(parsed.message),
      `├${'─'.repeat(58)}┤`,
      ...details,
      `└${'─'.repeat(58)}┘`,
    ].join('\n'),
  );
  console.log(`  status ${parsed.status}  ·  ${parsed.link ?? ''}\n`);
}

async function main() {
  resetBalances();
  resetAuthAttempts();

  const card = users[1]!.cardNumber;

  const scenarios: Array<[string, string, string, number]> = [
    ['an unknown card', '4000999999', '1234', 10_000],
    ['a wrong PIN', card, '9999', 10_000],
    ['a second wrong PIN', card, '9999', 10_000],
    ['a third wrong PIN, and the machine keeps the card', card, '9999', 10_000],
    ['more than the balance', users[2]!.cardNumber, '1234', 999_999],
    ['over the daily limit', users[3]!.cardNumber, '1234', 40_000],
  ];

  for (const [label, cardNumber, pin, amount] of scenarios) {
    console.log(`\n── ${label} ──`);

    try {
      await withdraw(cardNumber, pin, amount);
    } catch (error) {
      screen(parseError(error));
    }
  }

  await shutdown();

  console.log(`Every refusal above is one row in REFUSALS, one throw, and one
event in devtools. Try:

  withdrawal.result = "refused"
  status = ERROR`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
