/**
 * The bank's data, in memory.
 *
 * Nothing in `src/bank/` imports autotel. The domain is the constant across all
 * thirteen parts; the observability is the variable. Every part instruments these
 * same four operations from the outside, so when a part looks different from
 * the one before it, the difference is the lesson and not a change of subject.
 */

export interface User {
  id: string;
  name: string;
  cardNumber: string;
  pinHash: string;
}

export interface Account {
  id: string;
  userId: string;
  balancePence: number;
  dailyLimitPence: number;
  withdrawnTodayPence: number;
  /**
   * Which ledger cluster holds this account. Accounts migrated from the 1998
   * core sit on `legacy-core`, which answers the same questions correctly and
   * roughly eight times slower. Two accounts of twenty-five sit on it.
   *
   * Part 10 is about finding this field without being told it exists.
   */
  shard: 'core' | 'legacy-core';
}

/** Not a hash. A workshop. Never do this. */
const hash = (pin: string): string => `pin:${pin}`;

const NAMES = [
  'Ada Okafor',
  'Bruno Salas',
  'Chen Wei',
  'Dara Nolan',
  'Emeka Bello',
  'Farah Haddad',
  'Greta Lind',
  'Hugo Marchetti',
  'Ines Duarte',
  'Jonas Vetter',
  'Kira Blomqvist',
  'Luca Ferrari',
  'Maya Sundaram',
  'Nils Aasen',
  'Omar Riaz',
  'Petra Novak',
  'Quentin Roy',
  'Rosa Iglesias',
  'Sami Ahmed',
  'Tove Karlsen',
  'Ugo Bianchi',
  'Vera Pavlova',
  'Wes Duncan',
  'Xenia Adamou',
  'Yusuf Demir',
];

/**
 * A tiny linear congruential generator, so the fixtures are the same on every
 * machine on every run. A workshop where your numbers differ from the numbers
 * in the README is a workshop that teaches you to distrust the README.
 */
function seeded(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;

    return state / 0x1_00_00_00_00;
  };
}

const random = seeded(20_260_904);

export const users: User[] = NAMES.map((name, index) => ({
  id: `u_${String(index + 1).padStart(3, '0')}`,
  name,
  cardNumber: `4000${String(1000 + index)}`,
  pinHash: hash('1234'),
}));

export const accounts: Account[] = users.map((user, index) => ({
  id: `acc_${String(index + 1).padStart(3, '0')}`,
  userId: user.id,
  balancePence: 5_000 + Math.floor(random() * 120_000),
  dailyLimitPence: 30_000,
  withdrawnTodayPence: 0,
  // Accounts 7 and 19 never made it off the old cluster.
  shard: index === 6 || index === 18 ? 'legacy-core' : 'core',
}));

export const pinHashOf = hash;

const openingBalances = new Map(accounts.map((a) => [a.id, a.balancePence]));

/** Undo any debits an earlier run in this process left behind. */
export function resetBalances(): void {
  for (const account of accounts) {
    account.withdrawnTodayPence = 0;
    account.balancePence = openingBalances.get(account.id) ?? 0;
  }
}
