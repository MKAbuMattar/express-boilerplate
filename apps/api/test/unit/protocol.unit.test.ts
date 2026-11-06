import {MemoryQueueBroker} from '@express-boilerplate/common/config/queue/memory-queue.broker.js';
import {describe, expect, it} from 'vitest';
import {TransportMessage} from '../../src/config/transport/transport-message.js';
import {PingRequestDto} from '../../src/rest/dto/v1/ping-request.dto.js';

// @feature:transports
describe('TransportMessage', () => {
  it.each(['{"type":"ping"}', '{"type":"echo","a":1}'])('parses %s', (raw) => {
    expect(TransportMessage.parse(raw)?.type).toBeTypeOf('string');
  });
  it.each(['', 'nope', '[]', 'null', '{"type":1}', '{"no":"type"}'])(
    'rejects %j',
    (raw) => {
      expect(TransportMessage.parse(raw)).toBeNull();
    },
  );
  it('keeps the payload apart from the type', () => {
    expect(TransportMessage.parse('{"type":"echo","x":1}')?.payload).toEqual({
      x: 1,
    });
  });
});
// @end:transports

// @feature:network
describe('PingRequestDto', () => {
  it.each([
    '127.0.0.1',
    '::1',
    'localhost',
    'example.com',
    'a-b.example.co.uk',
  ])('accepts %s', (host) => {
    expect(PingRequestDto.from({host}).host).toBe(host);
  });
  it.each(['-c1', 'a..b', 'host-', 'x y', 'a;b', '$(id)', 'a'.repeat(64)])(
    'rejects %j',
    (host) => {
      expect(() => PingRequestDto.from({host})).toThrow();
    },
  );
});
// @end:network

describe('MemoryQueueBroker', () => {
  const waitFor = async (check: () => Promise<boolean>) => {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timed out');
  };

  it('retries with backoff, then dead-letters with the last error', async () => {
    const broker = new MemoryQueueBroker(3, 1);
    let calls = 0;
    broker.process('q', async () => {
      calls++;
      throw new Error(`boom ${calls}`);
    });
    await broker.enqueue('q', {a: 1});
    await waitFor(async () => (await broker.deadLetters('q')).length === 1);
    const [letter] = await broker.deadLetters('q');
    expect(calls).toBe(3);
    expect(letter).toMatchObject({
      payload: {a: 1},
      error: 'boom 3',
      attempts: 3,
    });
    await broker.close();
  });

  it('recovers on a retry without dead-lettering', async () => {
    const broker = new MemoryQueueBroker(3, 1);
    let calls = 0;
    broker.process('q', async () => {
      if (++calls < 2) throw new Error('flaky');
    });
    await broker.enqueue('q', {});
    await waitFor(async () => calls === 2);
    await new Promise((r) => setTimeout(r, 20));
    expect(await broker.deadLetters('q')).toEqual([]);
    await broker.close();
  });

  it('dead-letters jobs for a queue with no handler; replay of unknown id is null', async () => {
    const broker = new MemoryQueueBroker(1, 1);
    await broker.enqueue('orphan', {});
    await waitFor(
      async () => (await broker.deadLetters('orphan')).length === 1,
    );
    expect(await broker.replay('orphan', 'missing')).toBeNull();
    await broker.close();
  });
});
