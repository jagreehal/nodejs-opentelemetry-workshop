/**
 * Starts and stops the two service processes.
 *
 * Nothing here teaches observability; it is the plumbing that makes a
 * three-process example runnable with one command.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
import type { Account, User } from '../bank/index.ts';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const tsx = join(here, '..', '..', 'node_modules', '.bin', 'tsx');

let children: ChildProcess[] = [];

/**
 * Refuse to start on a port something else already holds. Without this, a
 * service left running by an earlier run answers the health check, the new one
 * dies silently, and you spend twenty minutes debugging the code you just
 * changed while talking to the version you replaced.
 */
const requireFreePort = (port: number) =>
  new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', () =>
      reject(
        new Error(
          `port ${port} is already in use. A service from an earlier run is ` +
            `probably still up: kill it with \`lsof -ti tcp:${port} | xargs kill\`.`,
        ),
      ),
    );
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve()));
  });

const waitForPort = async (port: number) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/ping`);

      if (res.ok) return;
    } catch {
      /* not listening yet */
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`service on :${port} never came up`);
};

export async function startServices(
  directory: string,
  authPort: number,
  accountsPort: number,
): Promise<void> {
  await Promise.all([requireFreePort(authPort), requireFreePort(accountsPort)]);

  children = [
    spawn(tsx, [join(here, directory, 'auth.ts'), String(authPort)], {
      stdio: ['ignore', 'inherit', 'inherit'],
    }),
    spawn(tsx, [join(here, directory, 'accounts.ts'), String(accountsPort)], {
      stdio: ['ignore', 'inherit', 'inherit'],
    }),
  ];
  await Promise.all([waitForPort(authPort), waitForPort(accountsPort)]);
}

/** Ask each service to flush its spans and exit, rather than killing it. */
export async function stopServices(...ports: number[]): Promise<void> {
  await Promise.all(
    ports.map((port) =>
      fetch(`http://127.0.0.1:${port}/shutdown`).catch(() => undefined),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 500));

  for (const child of children) child.kill();
  children = [];
}

/** What each route replies with. The services in this folder write exactly these. */
export type CardReply = Pick<User, 'id' | 'name'>;

export type AccountReply = Account;

export interface DebitReply {
  transactionId: string;
  balancePence: number;
}

/** The refusal both services send on a non-2xx. */
interface RefusalReply {
  code?: string;
  message?: string;
}

/** Throw the structured refusal the service sent, when the response is not 2xx. */
export async function okOrThrow(response: Response): Promise<void> {
  if (response.ok) return;

  // SAFETY: each service's catch block writes every non-2xx as { code, message },
  // and the .catch covers a body that is not JSON at all.
  const body = (await response.json().catch(() => ({}))) as RefusalReply;

  throw new Error(
    `${body.code ?? response.status}: ${body.message ?? 'unknown'}`,
  );
}

/** okOrThrow, then the body, as the shape the fetched route writes. */
export async function jsonOrThrow<T extends CardReply | AccountReply | DebitReply>(
  response: Response,
): Promise<T> {
  await okOrThrow(response);

  // SAFETY: T is one of the reply types above, and each route writes its reply
  // with JSON.stringify from the same src/bank types.
  return (await response.json()) as T;
}

/**
 * Read a JSON request body. The card number and PIN travel here rather than in
 * the URL, because HTTP instrumentation records the full URL on every span.
 */
export async function readJson(
  req: IncomingMessage,
): Promise<Record<string, string>> {
  let raw = '';

  for await (const chunk of req) raw += chunk;

  return raw ? JSON.parse(raw) : {};
}
