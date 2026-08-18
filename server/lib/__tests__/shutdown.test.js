// Graceful shutdown — ordering, idempotency, timeout and error propagation.
//
// Everything the handler touches is injected, so this runs with fakes and never
// opens a socket, a database connection or a worker timer.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createShutdownHandler, createUnhandledRejectionHandler } from '../shutdown.js';

/** Records the order in which the shutdown steps happen. */
function harness({ closeFails = false, dbFails = false, workerThrows = false } = {}) {
  const order = [];
  const exits = [];
  const errors = [];
  return {
    order,
    exits,
    errors,
    deps: {
      server: {
        close(cb) {
          order.push('server.close');
          setImmediate(() => cb(closeFails ? new Error('sockets still open') : undefined));
        },
      },
      closeIo: () => order.push('io.close'),
      disconnectDb: async () => {
        order.push('prisma.$disconnect');
        if (dbFails) throw new Error('pool already gone');
      },
      stopWorkers: [
        () => order.push('stop:notifications'),
        () => { if (workerThrows) throw new Error('worker stuck'); order.push('stop:settlement'); },
        () => order.push('stop:payout'),
        () => order.push('stop:escrow'),
        () => order.push('stop:expiry'),
      ],
      log: {
        log: () => {},
        warn: (...a) => errors.push(a.join(' ')),
        error: (...a) => errors.push(a.join(' ')),
      },
      exit: (code) => exits.push(code),
    },
  };
}

describe('createShutdownHandler', () => {
  test('drains in the correct order: workers → io → http → db', async () => {
    const h = harness();
    await createShutdownHandler(h.deps)('SIGTERM');

    assert.deepEqual(h.order, [
      'stop:notifications', 'stop:settlement', 'stop:payout', 'stop:escrow', 'stop:expiry',
      'io.close',
      'server.close',
      'prisma.$disconnect',
    ]);
    assert.deepEqual(h.exits, [0], 'a clean drain exits 0');
  });

  test('stops workers BEFORE closing the server', async () => {
    // Otherwise a timer could start new work against a pool we are about to drop.
    const h = harness();
    await createShutdownHandler(h.deps)('SIGTERM');
    assert.ok(h.order.indexOf('stop:escrow') < h.order.indexOf('server.close'));
  });

  test('closes Socket.IO BEFORE the HTTP server', async () => {
    // server.close() waits for open connections; a live websocket never ends.
    const h = harness();
    await createShutdownHandler(h.deps)('SIGTERM');
    assert.ok(h.order.indexOf('io.close') < h.order.indexOf('server.close'));
  });

  test('disconnects the database LAST', async () => {
    const h = harness();
    await createShutdownHandler(h.deps)('SIGTERM');
    assert.equal(h.order.at(-1), 'prisma.$disconnect');
  });

  test('is idempotent — a second signal does not drain twice', async () => {
    const h = harness();
    const shutdown = createShutdownHandler(h.deps);
    await shutdown('SIGTERM');
    await shutdown('SIGTERM');   // platforms send SIGTERM then SIGKILL
    await shutdown('SIGINT');    // and an operator may hit Ctrl-C twice

    assert.equal(h.order.filter((s) => s === 'server.close').length, 1);
    assert.deepEqual(h.exits, [0], 'exits exactly once');
  });

  test('a throwing worker does not strand the rest of the sequence', async () => {
    const h = harness({ workerThrows: true });
    await createShutdownHandler(h.deps)('SIGTERM');

    assert.ok(h.order.includes('server.close'), 'still closed the server');
    assert.ok(h.order.includes('prisma.$disconnect'), 'still released the pool');
    assert.deepEqual(h.exits, [0]);
    assert.ok(h.errors.some((e) => /worker stuck/.test(e)), 'and the failure was logged, not swallowed');
  });

  test('a failed server close exits NON-ZERO and is logged', async () => {
    const h = harness({ closeFails: true });
    await createShutdownHandler(h.deps)('SIGTERM');

    assert.deepEqual(h.exits, [1]);
    assert.ok(h.errors.some((e) => /sockets still open/.test(e)));
    assert.ok(!h.order.includes('prisma.$disconnect'), 'does not pretend the drain finished');
  });

  test('a failed database disconnect exits NON-ZERO', async () => {
    const h = harness({ dbFails: true });
    await createShutdownHandler(h.deps)('SIGTERM');
    assert.deepEqual(h.exits, [1]);
    assert.ok(h.errors.some((e) => /pool already gone/.test(e)));
  });

  test('forces a non-zero exit when the drain exceeds its deadline', async () => {
    const order = [];
    const exits = [];
    const shutdown = createShutdownHandler({
      server: { close() { order.push('server.close'); /* never calls back */ } },
      timeoutMs: 20,
      log: { log() {}, warn() {}, error() {} },
      exit: (c) => exits.push(c),
    });

    shutdown('SIGTERM');
    await new Promise((r) => setTimeout(r, 60));

    assert.deepEqual(exits, [1], 'must still exit rather than hang until SIGKILL');
  });

  test('a clean drain does not later trip the timeout', async () => {
    const h = harness();
    await createShutdownHandler({ ...h.deps, timeoutMs: 30 })('SIGTERM');
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(h.exits, [0], 'exactly one exit, code 0');
  });

  test('works with no workers, no io and no database', async () => {
    const exits = [];
    await createShutdownHandler({
      server: { close: (cb) => cb() },
      log: { log() {}, warn() {}, error() {} },
      exit: (c) => exits.push(c),
    })('SIGTERM');
    assert.deepEqual(exits, [0]);
  });
});

describe('createUnhandledRejectionHandler', () => {
  test('logs the reason and exits non-zero — Node fail-fast, with context', () => {
    const errors = [];
    const exits = [];
    const handler = createUnhandledRejectionHandler({
      log: { error: (...a) => errors.push(a.join(' ')) },
      exit: (c) => exits.push(c),
    });

    handler(new Error('boom'));
    assert.equal(exits[0], 1);
    assert.ok(/boom/.test(errors[0]));
  });

  test('handles a non-Error rejection without throwing itself', () => {
    const errors = [];
    const exits = [];
    const handler = createUnhandledRejectionHandler({
      log: { error: (...a) => errors.push(a.join(' ')) },
      exit: (c) => exits.push(c),
    });

    handler('a bare string');
    handler(undefined);
    assert.deepEqual(exits, [1, 1]);
    assert.ok(/a bare string/.test(errors[0]));
  });
});
