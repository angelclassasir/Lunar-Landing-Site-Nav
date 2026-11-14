import { describe, expect, it } from 'vitest'
import { SITES, customSite } from './sites'
import { nearbyAlternatives } from './globeMarkers'

const site = (id: string) => SITES.find((s) => s.id === id)!

const pairs = (selectedId: string) =>
  nearbyAlternatives(site(selectedId), SITES).map(({ site: near, km }) => [near.id, km])

const expectKm = (actual: number, expected: number) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)
}

describe('nearbyAlternatives', () => {
  it('Apollo 11: Apollo 16 is the only site within 400 km', () => {
    const result = nearbyAlternatives(site('apollo11'), SITES)
    expect(result.map((a) => a.site.id)).toEqual(['apollo16'])
    expectKm(result[0].km, 379)
  })

  it('Apollo 15 is isolated', () => {
    expect(pairs('apollo15')).toEqual([])
  })

  it('Apollo 16 puts the same category first, even when it is farther', () => {
    const result = nearbyAlternatives(site('apollo16'), SITES)
    expect(result.map((a) => a.site.id)).toEqual(['apollo11', 'slim'])
    expectKm(result[0].km, 379)
    expectKm(result[1].km, 318)
  })

  it('Shackleton keeps the four nearest polar candidates in distance order', () => {
    const result = nearbyAlternatives(site('shackleton'), SITES)
    expect(result.map((a) => a.site.id)).toEqual([
      'connectingridge',
      'southpole',
      'degerlache',
      'malapert',
    ])
    const expected = [7, 12, 54, 128]
    result.forEach((alternative, index) => expectKm(alternative.km, expected[index]))
  })

  it('IM-1 lists the nearest candidate and CLPS sites', () => {
    const result = nearbyAlternatives(site('im1'), SITES)
    expect(result.map((a) => a.site.id)).toEqual([
      'monsmouton',
      'malapert',
      'cabeus',
      'southpole',
    ])
    const expected = [176, 178, 231, 296]
    result.forEach((alternative, index) => expectKm(alternative.km, expected[index]))
  })

  it('a custom point has no category match: at most four, by distance, no custom entries', () => {
    const custom = customSite(-89.5, 0)
    const catalog = [...SITES, custom]
    const result = nearbyAlternatives(custom, catalog)

    expect(result.length).toBeLessThanOrEqual(4)
    expect(result.every((alternative) => alternative.site.category !== 'custom')).toBe(true)
    expect(result.every((alternative) => alternative.site.id !== custom.id)).toBe(true)

    const km = result.map((alternative) => alternative.km)
    expect(km).toEqual([...km].sort((a, b) => a - b))
  })

  it('honours maxKm and max', () => {
    const near = nearbyAlternatives(site('shackleton'), SITES, { maxKm: 20 })
    expect(near.map((a) => a.site.id)).toEqual(['connectingridge', 'southpole'])

    const two = nearbyAlternatives(site('shackleton'), SITES, { max: 2 })
    expect(two.map((a) => a.site.id)).toEqual(['connectingridge', 'southpole'])
  })
})
