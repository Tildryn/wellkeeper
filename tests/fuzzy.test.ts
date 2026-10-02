import { describe, it, expect } from 'vitest'
import { fuzzyScore, fuzzyRank } from '@/fuzzy'

const AREAS = [
  'Risenholm, Town',
  'Ceaseless City, Downtown',
  'West Lake',
  'Scar: Lake Village',
  'Suthwood, Outskirts',
]

const rank = (query: string) => fuzzyRank(query, AREAS, (a) => a)

describe('fuzzyScore', () => {
  it('matches whatever the case', () => {
    expect(fuzzyScore('TOWN', 'Risenholm, Town')).not.toBeNull()
  })

  it('matches letters in order with others between them', () => {
    expect(fuzzyScore('wstlk', 'West Lake')).not.toBeNull()
  })

  it('does not match letters out of order, or that are not there', () => {
    expect(fuzzyScore('kalw', 'West Lake')).toBeNull()
    expect(fuzzyScore('xyz', 'West Lake')).toBeNull()
  })

  it('needs every word of the query', () => {
    expect(fuzzyScore('scar lake', 'Scar: Lake Village')).not.toBeNull()
    expect(fuzzyScore('scar town', 'Scar: Lake Village')).toBeNull()
  })

  it('matches everything when the query is empty', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
    expect(fuzzyScore('   ', 'anything')).toBe(0)
  })
})

describe('fuzzyRank', () => {
  it('puts a word that starts a word ahead of one found inside another', () => {
    expect(rank('town')).toEqual(['Risenholm, Town', 'Ceaseless City, Downtown'])
  })

  it('puts a whole word ahead of scattered letters', () => {
    expect(rank('lake')[0]).toBe('West Lake')
    expect(rank('lake')).toContain('Scar: Lake Village')
  })

  it('finds an area by words from different parts of its name', () => {
    expect(rank('lake vil')).toEqual(['Scar: Lake Village'])
  })

  it('returns the list as it came for an empty query', () => {
    expect(rank('')).toEqual(AREAS)
  })

  it('returns nothing when nothing matches', () => {
    expect(rank('qqq')).toEqual([])
  })
})
