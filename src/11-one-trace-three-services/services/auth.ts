/**
 * The auth service. Its own process, its own init(), its own service name.
 */
import { createServer } from 'node:http';
import { init, trace, ctx, shutdown } from 'autotel';
import { findUserByCard, verifyPin, isBankError } from '../../bank/index.ts';
import { readJson } from '../harness.ts';

init({ service: 'auth-service', devtools: true });

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

  const body = await readJson(req);
  const card = body.card ?? '';

  try {
    if (url.pathname === '/card') {
      const user = await trace.run('auth.find_card', async () => {
        console.log(`[auth-service]     trace ${ctx.traceId}`);
        ctx.setAttribute('card.last4', card.slice(-4));

        return findUserByCard(card);
      });

      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: user.id, name: user.name }));

      return;
    }

    if (url.pathname === '/verify') {
      await trace.run('auth.verify_pin', async () => {
        ctx.setAttribute('card.last4', card.slice(-4));
        await verifyPin(card, body.pin ?? '');
      });
      res.end('ok');

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

server.listen(port, '127.0.0.1', () => console.log(`auth-service :${port}`));
