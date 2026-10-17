/**
 * The accounts service. Owns the ledger, and the shard from part 10.
 */
import { createServer } from 'node:http';
import { init, trace, ctx, shutdown } from 'autotel';
import { getAccount, debit, isBankError } from '../../bank/index.ts';

init({ service: 'accounts-service', devtools: true });

const port = Number(process.argv[2]);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);

  if (url.pathname === '/ping') {
    res.end('ok');

    return;
  }

  if (url.pathname === '/shutdown') {
    res.end('bye');
    await shutdown();
    server.close(() => process.exit(0));

    return;
  }

  try {
    if (url.pathname === '/account') {
      const account = await trace.run('accounts.get', async () => {
        console.log(`[accounts-service] trace ${ctx.traceId}`);
        const found = await getAccount(url.searchParams.get('userId') ?? '');
        ctx.setAttributes({
          'account.id': found.id,
          'account.shard': found.shard,
        });

        return found;
      });

      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(account));

      return;
    }

    if (url.pathname === '/debit') {
      const receipt = await trace.run('accounts.debit', async () => {
        const account = await getAccount(url.searchParams.get('userId') ?? '');
        const amountPence = Number(url.searchParams.get('amountPence'));
        ctx.setAttributes({
          'account.id': account.id,
          'account.shard': account.shard,
          'withdrawal.amount_pence': amountPence,
        });

        return debit(account, amountPence);
      });

      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(receipt));

      return;
    }
  } catch (error) {
    res.statusCode = isBankError(error) ? 400 : 500;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        code: isBankError(error) ? error.code : 'UNEXPECTED',
        message: error instanceof Error ? error.message : String(error),
      }),
    );

    return;
  }

  res.statusCode = 404;
  res.end('not found');
});

server.listen(port, '127.0.0.1', () =>
  console.log(`accounts-service :${port}`),
);
