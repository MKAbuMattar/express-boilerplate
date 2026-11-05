import {afterEach, describe, expect, it, vi} from 'vitest';
import {MemoryCacheStore} from '../../src/config/cache/memory-cache.store.js';

describe('MemoryCacheStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires entries after the TTL', async () => {
    vi.useFakeTimers();
    const store = new MemoryCacheStore();
    await store.set('k', 'v', 1);
    expect(await store.get('k')).toBe('v');
    vi.advanceTimersByTime(1001);
    expect(await store.get('k')).toBeNull();
  });

  it('setIfAbsent only wins once, and again after expiry', async () => {
    vi.useFakeTimers();
    const store = new MemoryCacheStore();
    expect(await store.setIfAbsent('n', '1', 1)).toBe(true);
    expect(await store.setIfAbsent('n', '1', 1)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(await store.setIfAbsent('n', '1', 1)).toBe(true);
  });

  it('deletes several keys and clears on close', async () => {
    const store = new MemoryCacheStore();
    await store.set('a', '1', 60);
    await store.set('b', '2', 60);
    await store.set('c', '3', 60);
    await store.delete('a', 'b');
    expect(await store.get('a')).toBeNull();
    expect(await store.get('c')).toBe('3');
    await store.close();
    expect(await store.get('c')).toBeNull();
  });
});
