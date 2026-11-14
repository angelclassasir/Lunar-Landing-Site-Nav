import type { TimeWindow } from './types'

/**
 * One stretch during which the Sun (or the Earth, or both) is either up or
 * down. Periods alternate and tile the whole look-ahead range, so the gaps
 * between visible windows are periods too.
 *
 * `start` / `end` are always real epoch times: at the edge of the range they
 * are clamped to it, and the matching `*Known` flag says whether that edge is
 * the true crossing or just where the data ran out.
 */
export interface Period {
  up: boolean
  start: number
  end: number
  /** false when the period began before the range (or at its very start) */
  startKnown: boolean
  /** false when the period is still open at the end of the range */
  endKnown: boolean
}

/**
 * Turn the sorted "up" windows of buildTimeline into alternating up/down
 * periods covering [rangeStart, rangeEnd] with no gaps.
 *
 * The first period starts at rangeStart by construction, so it has
 * startKnown=false: whatever it is, it was already going on before the data
 * began. A final period ending at rangeEnd has endKnown=false, and an open
 * window (closed=false) never has a known end.
 */
export function buildPeriods(
  windows: TimeWindow[],
  rangeStart: number,
  rangeEnd: number,
): Period[] {
  const periods: Period[] = []
  if (!(rangeEnd > rangeStart)) return periods

  const push = (up: boolean, start: number, end: number, startKnown: boolean, endKnown: boolean) => {
    // Clamp guard: a zero-length period would break the alternation.
    if (end <= start) return
    periods.push({ up, start, end, startKnown, endKnown })
  }
  const startsInside = (start: number) => start > rangeStart

  let cursor = rangeStart
  for (const window of windows) {
    const start = Math.max(rangeStart, window.start)
    const end = Math.min(rangeEnd, window.end)
    if (end <= start) continue
    // The gap before this window is a down period.
    if (start > cursor) push(false, cursor, start, startsInside(cursor), true)
    // A closed window that ends inside the range has a real end time; anything
    // clipped by rangeEnd (or still open, closed=false) does not.
    push(true, start, end, startsInside(start), window.closed && end < rangeEnd)
    cursor = Math.max(cursor, end)
  }
  // Whatever is left is light-off until the range ends; we cannot know when it
  // comes back.
  if (cursor < rangeEnd) push(false, cursor, rangeEnd, startsInside(cursor), false)
  return periods
}

/** The period around an instant, plus the two that follow it. */
export interface PassView {
  current: Period
  next?: Period
  afterNext?: Period
  /** Up for the entire range, with both edges unknown */
  always: boolean
  /** Down for the entire range, with both edges unknown */
  never: boolean
}

/**
 * Locate `t` in the periods (linear scan: a 60-day look-ahead has only a
 * handful of them). Returns null when `t` is outside the covered range.
 * A boundary belongs to the period that starts there.
 */
export function passAt(periods: Period[], t: number): PassView | null {
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i]
    if (t < period.start) return null
    const last = i === periods.length - 1
    if (t < period.end || (last && t <= period.end)) {
      const only = periods.length === 1
      return {
        current: period,
        next: periods[i + 1],
        afterNext: periods[i + 2],
        always: only && period.up && !period.startKnown && !period.endKnown,
        never: only && !period.up && !period.startKnown && !period.endKnown,
      }
    }
  }
  return null
}
