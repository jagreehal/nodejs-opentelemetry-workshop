/**
 * The auth service. Its own process, its own init(), its own service name.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { init, trace, ctx, context, shutdown } from 'autotel';
import { extractTraceContext } from 'autotel/http';
import { findUserByCard, verifyPin, isBankError } from '../../bank/index.ts';
import { readJson } from '../harness.ts';

init({
  service: 'auth-service',
  devtools: true,
  // Copy any baggage the caller sent onto every span this service creates,
  // with no prefix. Nothing sets baggage until part 12; this is the receiver
  // half, and it costs nothing while the header is empty.
  baggage: '',
});

const port = Number(process.argv[2]);

const server = createServer((req, res) => {
  // Everything this request does runs inside the context the caller sent, so
  // any span started below is a child of the caller's span rather than a root.
  const incoming = extractTraceContext(req.headers);

  return context.with(incoming, () => handle(req, res));
});

async function handle(req: IncomingMessage, res: ServerResponse) {
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
}

server.listen(port, '127.0.0.1', () => console.log(`auth-service :${port}`));
