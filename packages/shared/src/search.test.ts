import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';

describe('matchesSearch', () => {
  it('tout matche quand la requête est vide', () => {
    expect(matchesSearch('', 'Thé vert', 'Lipton')).toBe(true);
    expect(matchesSearch('   ', null, undefined)).toBe(true);
  });

  it('matche sur nimporte lequel des champs fournis', () => {
    expect(matchesSearch('lipton', 'Thé vert', 'Lipton')).toBe(true);
    expect(matchesSearch('the vert', 'Thé vert', 'Lipton')).toBe(true);
    expect(matchesSearch('coca', 'Thé vert', 'Lipton')).toBe(false);
  });

  it('ignore la casse et les accents', () => {
    expect(matchesSearch('THÉ', 'Thé vert', null)).toBe(true);
    expect(matchesSearch('the', 'Thé vert', null)).toBe(true);
  });

  it('ignore les champs null/undefined sans planter', () => {
    expect(matchesSearch('lipton', null, 'Lipton', undefined)).toBe(true);
    expect(matchesSearch('lipton', null, undefined)).toBe(false);
  });
});
