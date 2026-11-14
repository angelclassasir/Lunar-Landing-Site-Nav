import { useMemo } from 'react'
import { buildPeriods, type Period } from '../lib/astro/passes'
import { buildTimeline } from '../lib/astro/timeline'
import type { LunarSite } from '../lib/astro/types'

const DAY_MS = 86_400_000

/**
 * The look-ahead surrounds the scrub window: 15 days behind it catch the
 * stretch that is already under way (so "away since" is not lost), and 15 days
 * past its end show where the next full cycle goes. The scrub window itself is
 * 30 days, so the whole look-ahead is 60 days.
 */
const LOOK_BEHIND_MS = 15 * DAY_MS
const LOOK_AHEAD_MS = 45 * DAY_MS

/** One hour: the Sun and Earth move ~0.5°/h, well under the 1 s edge refine. */
const STEP_MS = 3_600_000

export interface PassPeriods {
  sun: Period[]
  earth: Period[]
  both: Period[]
}

/**
 * Visibility periods for the Sun, the Earth and both together, over the 60-day
 * look-ahead that surrounds the scrub window.
 *
 * Keyed on the site fields that change the sky and on the window start, never
 * on the instant: scrubbing through the 30-day window reuses the same periods
 * and only passAt() runs per frame (a linear scan over a handful of items).
 */
export function usePassPeriods(site: LunarSite, windowStart: number): PassPeriods {
  return useMemo(() => {
    const from = windowStart - LOOK_BEHIND_MS
    const to = windowStart + LOOK_AHEAD_MS
    const timeline = buildTimeline(site, from, to, STEP_MS)
    return {
      sun: buildPeriods(timeline.sunWindows, from, to),
      earth: buildPeriods(timeline.commWindows, from, to),
      both: buildPeriods(timeline.jointWindows, from, to),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site.id, site.lat, site.lon, site.horizon, site.mastHeightM, windowStart])
}

/** Total span of the look-ahead, for copy that has to name it. */
export const LOOK_AHEAD_DAYS = (LOOK_BEHIND_MS + LOOK_AHEAD_MS) / DAY_MS