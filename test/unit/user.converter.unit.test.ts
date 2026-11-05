import {describe, expect, it} from 'vitest';
import {UserConverter} from '../../src/converter/user.converter.js';
import type {UserEntity} from '../../src/model/user.entity.js';

describe('UserConverter', () => {
  const created = new Date('2026-01-02T03:04:05.000Z');

  it('maps an entity to the public DTO', () => {
    const entity = {
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      age: 42,
      createdAt: created,
      updatedAt: created,
    } as UserEntity;
    expect(UserConverter.toDto(entity)).toEqual({
      id: 'u1',
      name: 'Alice',
      email: 'alice@example.com',
      age: 42,
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('accepts the JSON copy that comes back from the cache', () => {
    const cached = JSON.parse(
      JSON.stringify({
        id: 'u1',
        name: 'A',
        email: 'a@b.co',
        age: 1,
        createdAt: created,
        updatedAt: created,
      }),
    ) as UserEntity;
    expect(UserConverter.toDto(cached).createdAt).toBe(
      '2026-01-02T03:04:05.000Z',
    );
  });

  it('stringifies non-string ids (MongoDB ObjectId)', () => {
    const entity = {
      id: {toString: () => 'abc123'} as unknown as string,
      name: 'A',
      email: 'a@b.co',
      age: 1,
      createdAt: created,
      updatedAt: created,
    } as UserEntity;
    expect(UserConverter.toDto(entity).id).toBe('abc123');
  });
});
