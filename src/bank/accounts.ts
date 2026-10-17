import { accounts } from './data.ts';
import { sleep } from './clock.ts';

export async function getAccount(userId: string) {
  await sleep(10);
  const account = accounts.find((candidate) => candidate.userId === userId);

  if (!account) throw new Error(`No account for user ${userId}`);

  return account;
}
