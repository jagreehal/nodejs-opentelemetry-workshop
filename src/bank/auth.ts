import { users, pinHashOf } from './data.ts';
import { BankError } from './errors.ts';
import { sleep } from './clock.ts';

const failedAttempts = new Map<string, number>();

/** Look a customer up by the card they pushed into the slot. */
export async function findUserByCard(cardNumber: string) {
  await sleep(15);
  const user = users.find((candidate) => candidate.cardNumber === cardNumber);

  if (!user) {
    throw new BankError('CARD_NOT_RECOGNISED', 'Card not recognised', {
      'card.last4': cardNumber.slice(-4),
    });
  }

  return user;
}

/**
 * Three wrong PINs and the machine keeps the card. The counter is per card and
 * survives between withdrawals, which is why a customer can be locked out by
 * something that happened ten minutes ago in a different request.
 */
export async function verifyPin(cardNumber: string, pin: string) {
  await sleep(5);
  const attempts = failedAttempts.get(cardNumber) ?? 0;

  if (attempts >= 3) {
    throw new BankError('CARD_RETAINED', 'Card retained', {
      'auth.attempts': attempts,
    });
  }

  const user = users.find((candidate) => candidate.cardNumber === cardNumber);

  if (!user || user.pinHash !== pinHashOf(pin)) {
    const next = attempts + 1;
    failedAttempts.set(cardNumber, next);
    throw new BankError(
      next >= 3 ? 'CARD_RETAINED' : 'PIN_INCORRECT',
      next >= 3 ? 'Card retained' : 'PIN incorrect',
      {
        'auth.attempts': next,
        'auth.attempts_remaining': Math.max(0, 3 - next),
      },
    );
  }

  failedAttempts.delete(cardNumber);

  return user;
}

export function resetAuthAttempts(): void {
  failedAttempts.clear();
}
