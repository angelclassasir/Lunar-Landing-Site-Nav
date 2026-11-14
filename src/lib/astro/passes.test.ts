import { describe, expect, it } from 'vitest'
import { buildPeriods, passAt, type Period } from './passes'
import { buildTimeline } from './timeline'
import { SITES, customSite } from './sites'
import type { TimeWindow } from './types'
import { formatSpan } from '../format'

const HOUR = 3_600_000
const DAY = 86_400_000

const window = (start: number, end: number, closed = true): TimeWindow => ({
  start,
  end,
  durationMs: end - start,
  closed,
})

const shape = (periods: Period[]) =>
  periods.map((p) => [p.up ? 'up' : 'down', p.start, p.end, p.startKnown, p.endKnown])

describe('buildPeriods', () => {
  it('alternates up and down across the range', () => {
    const periods = buildPeriods([window(10, 20), window(30, 40)], 0, 50)
    expect(shape(periods)).toEqual([
      ['down', 0, 10, false, true],
      ['up', 10, 20, true, true],
      ['down', 20, 30, true, true],
      ['up', 30, 40, true, true],
      ['down', 40, 50, true, false],
    ])
  })

  it('covers the range with no gaps and no overlaps', () => {
    const periods = buildPeriods([window(10, 20), window(30, 40)], 0, 50)
    expect(periods[0].start).toBe(0)
    expect(periods[periods.length - 1].end).toBe(50)
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].start).toBe(periods[i - 1].end)
      expect(periods[i].up).toBe(!periods[i - 1].up)
    }
  })

  it('leaves the end unknown for an open window', () => {
    const periods = buildPeriods([window(10, 20), window(30, 50, false)], 0, 50)
    expect(shape(periods).at(-1)).toEqual(['up', 30, 50, true, false])
  })

  it('handles a window that starts before the range', () => {
    const periods = buildPeriods([window(-10, 20)], 0, 50)
    expect(shape(periods)).toEqual([
      ['up', 0, 20, false, true],
      ['down', 20, 50, true, false],
    ])
  })

  it('covers a range with no windows at all', () => {
    const periods = buildPeriods([], 0, 50)
    expect(shape(periods)).toEqual([['down', 0, 50, false, false]])
  })

  it('reports always and never for a single open period', () => {
    const always = passAt(buildPeriods([window(0, 50, false)], 0, 50), 25)
    expect(always?.always).toBe(true)
    expect(always?.never).toBe(false)

    const never = passAt(buildPeriods([], 0, 50), 25)
    expect(never?.never).toBe(true)
    expect(never?.always).toBe(false)
    // A gap between two windows is not "never": the state changes again.
    const later = passAt(buildPeriods([window(10, 20), window(30, 40)], 0, 50), 25)
    expect(later?.never).toBe(false)
  })
})

describe('passAt', () => {
  const periods = buildPeriods([window(10, 20), window(30, 40)], 0, 50)

  it('returns the current period and the two after it', () => {
    const view = passAt(periods, 15)
    expect(view?.current).toMatchObject({ up: true, start: 10, end: 20 })
    expect(view?.next).toMatchObject({ up: false, start: 20, end: 30 })
    expect(view?.afterNext).toMatchObject({ up: true, start: 30, end: 40 })
    expect(view?.always).toBe(false)
    expect(view?.never).toBe(false)
  })

  it('gives a boundary to the period that starts there', () => {
    expect(passAt(periods, 10)?.current.up).toBe(true)
    expect(passAt(periods, 20)?.current.up).toBe(false)
  })

  it('returns null outside the covered range', () => {
    expect(passAt(periods, -1)).toBeNull()
    expect(passAt(periods, 51)).toBeNull()
  })

  it('has no next period after the last one', () => {
    const view = passAt(periods, 50)
    expect(view?.current.up).toBe(false)
    expect(view?.next).toBeUndefined()
    expect(view?.afterNext).toBeUndefined()
  })
})

describe('real ephemeris', () => {
  const START = Date.parse('2028-01-01T00:00:00Z')
  const END = START + 60 * DAY
  const apollo11 = SITES.find((s) => s.id === 'apollo11')!

  it('Apollo 11: the Earth never sets, the Sun keeps a ~14.8-day rhythm', () => {
    const timeline = buildTimeline(apollo11, START, END, HOUR)

    const earth = buildPeriods(timeline.commWindows, START, END)
    expect(passAt(earth, START + 30 * DAY)?.always).toBe(true)

    const sun = buildPeriods(timeline.sunWindows, START, END)
    const known = sun.filter((p) => p.startKnown && p.endKnown && p.up)
    expect(known.length).toBeGreaterThanOrEqual(2)
    for (const period of known) {
      const days = (period.end - period.start) / DAY
      expect(days).toBeGreaterThan(13)
      expect(days).toBeLessThan(16.5)
    }
    // Sunlit and night alternate, so a full known day/night pair is ~29.5 days.
    const firstKnown = known[0]
    const after = sun[sun.indexOf(firstKnown) + 1]
    const pairDays = (after.end - firstKnown.start) / DAY
    expect(pairDays).toBeGreaterThan(27)
    expect(pairDays).toBeLessThan(32)
  })

  it('the far side never sees the Earth', () => {
    const farSide = customSite(0, 180)
    const timeline = buildTimeline(farSide, START, END, HOUR)
    const earth = buildPeriods(timeline.commWindows, START, END)
    expect(passAt(earth, START + 30 * DAY)?.never).toBe(true)
  })
})

describe('formatSpan', () => {
  it('uses days above one day', () => {
    expect(formatSpan(3 * DAY + 4 * HOUR + 55 * 60_000)).toBe('3 d 4 h')
  })

  it('uses hours above one hour', () => {
    expect(formatSpan(5 * HOUR + 20 * 60_000)).toBe('5 h 20 min')
    expect(formatSpan(5 * HOUR + 20 * 60_000 + 59_000)).toBe('5 h 20 min')
  })

  it('uses minutes below one hour', () => {
    expect(formatSpan(40 * 60_000)).toBe('40 min')
    expect(formatSpan(40 * 60_000 + 59_000)).toBe('40 min')
    expect(formatSpan(0)).toBe('0 min')
  })
})
