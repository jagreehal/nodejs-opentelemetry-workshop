import type { Account } from './data.ts';
import { BankError } from './errors.ts';
import { sleep } from './clock.ts';

let transactionCounter = 0;

/**
 * Take money out of an account.
 *
 * The `legacy-core` shard answers correctly and slowly. Nothing in this file
 * says so out loud, and nothing in the ATM's code knows the shard exists. That
 * is the ordinary situation: the field that explains your latency is a
 * property of the data, not of the request.
 */
export async function debit(account: Account, amountPence: number) {
  await sleep(account.shard === 'legacy-core' ? 320 : 40);

  if (amountPence > account.balancePence) {
    throw new BankError('INSUFFICIENT_FUNDS', 'Insufficient funds', {
      'account.id': account.id,
      'withdrawal.amount_pence': amountPence,
    });
  }

  if (account.withdrawnTodayPence + amountPence > account.dailyLimitPence) {
    throw new BankError('DAILY_LIMIT_EXCEEDED', 'Daily limit exceeded', {
      'account.id': account.id,
      'account.daily_limit_pence': account.dailyLimitPence,
      'account.withdrawn_today_pence': account.withdrawnTodayPence,
    });
  }

  account.balancePence -= amountPence;
  account.withdrawnTodayPence += amountPence;
  transactionCounter += 1;

  return {
    transactionId: `txn_${String(transactionCounter).padStart(6, '0')}`,
    balancePence: account.balancePence,
  };
}

export function resetLedger(): void {
  transactionCounter = 0;
}
