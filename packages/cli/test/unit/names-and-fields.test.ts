import {describe, expect, it} from 'vitest';
import {Fields} from '../../src/model/field.ts';
import {Names} from '../../src/model/names.ts';

describe('Names', () => {
  it.each([
    ['order', 'Order', 'orders', 'orders', 'ORDERS'],
    ['blog-post', 'BlogPost', 'blog-posts', 'blog_posts', 'BLOG_POSTS'],
    ['BlogPost', 'BlogPost', 'blog-posts', 'blog_posts', 'BLOG_POSTS'],
    ['category', 'Category', 'categories', 'categories', 'CATEGORIES'],
    ['box', 'Box', 'boxes', 'boxes', 'BOXES'],
    ['day', 'Day', 'days', 'days', 'DAYS'],
  ])('%s', (raw, pascal, plural, table, constant) => {
    const names = new Names(raw);
    expect([names.pascal, names.plural, names.table, names.constant]).toEqual([
      pascal,
      plural,
      table,
      constant,
    ]);
  });

  it('refuses names that cannot be identifiers', () => {
    expect(() => new Names('1st')).toThrow();
    expect(() => new Names('--')).toThrow();
  });
});

describe('Fields.parse', () => {
  it('reads name:type pairs, string by default', () => {
    expect(Fields.parse('title, views:int,done:boolean')).toEqual([
      {name: 'title', type: 'string'},
      {name: 'views', type: 'int'},
      {name: 'done', type: 'boolean'},
    ]);
  });

  it('rejects unknown types, bad names and reserved columns', () => {
    expect(() => Fields.parse('a:float')).toThrow(/type/);
    expect(() => Fields.parse('Bad:string')).toThrow(/camelCase/);
    expect(() => Fields.parse('id:string')).toThrow(/automatically/);
  });
});
