import { useEffect, useMemo, useRef, useState } from 'react'
import { buildTimeline } from '../lib/astro/timeline'
import type { LunarSite } from '../lib/astro/types'
import {
  DAY_MS,
  SCRUB_SPAN_MS,
  minutesOfDayUtc,
  sliderMinutesToTime,
  timeToSliderMinutes,
  utcDay,
  utcDayStart,
} from '../lib/astro/scrub'

/** Playback speed: three simulated hours every 80 ms. */
const PLAY_STEP_MS = 3 * 3_600_000
const PLAY_INTERVAL_MS = 80

export interface ScrubberOptions {
  site: LunarSite
  /** 'YYYY-MM-DD' UTC */
  day: string
  onDayChange: (day: string) => void
  /** Minutes after midnight UTC, 0..1435 */
  onMinutesChange: (minutes: number) => void
  /** Shared instant, UTC epoch ms */
  t: number
}

export type Scrubber = ReturnType<typeof useScrubber>

/** Move the shared instant through the same day/minutes pair the date input uses. */
export function commitInstant(
  next: number,
  onDayChange: (day: string) => void,
  onMinutesChange: (minutes: number) => void,
) {
  onDayChange(utcDay(next))
  onMinutesChange(minutesOfDayUtc(next, 1))
}

/**
 * State and playback for the 30-day lunar-cycle scrubber.
 *
 * One instance per mode. The window belongs to the scrubber, while the instant
 * itself stays shared: `t` moves it forward, and the day/minutes pair in App
 * records where it landed. Dragging or playing therefore never rebuilds the
 * window, only a date picked elsewhere or an instant outside it.
 */
export function useScrubber({ site, day, onDayChange, onMinutesChange, t }: ScrubberOptions) {
  // The scrub window is local: a date picked elsewhere recentres it, but the
  // shared instant only ever moves it when it falls outside.
  const [windowStart, setWindowStart] = useState(() => {
    const start = Date.parse(`${day}T00:00:00Z`)
    return Number.isFinite(start) ? start : utcDayStart(Date.now())
  })
  const windowEnd = windowStart + SCRUB_SPAN_MS
  // 30 days at 1 h resolution: independent of the playhead, so dragging and
  // playing never rebuild it.
  const cycle = useMemo(
    () => buildTimeline(site, windowStart, windowEnd, 3_600_000),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [site, windowStart],
  )

  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  // The interval must read the latest instant without restarting every tick.
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  // A new site is a new question: stop the playback.
  useEffect(() => {
    setPlaying(false)
  }, [site.id, site.lat, site.lon])

  // Date input or any other external jump out of the window: recentre on it.
  useEffect(() => {
    if (t < windowStart || t > windowEnd) setWindowStart(utcDayStart(t))
  }, [t, windowStart, windowEnd])

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      let next = tRef.current + PLAY_STEP_MS
      if (next >= windowEnd) {
        if (loop) {
          next = windowStart
        } else {
          next = windowEnd
          setPlaying(false)
        }
      }
      commitInstant(next, onDayChange, onMinutesChange)
    }, PLAY_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [playing, loop, windowStart, windowEnd, onDayChange, onMinutesChange])

  const dayStart = useMemo(() => Date.parse(`${day}T00:00:00Z`), [day])

  const shiftDay = (deltaDays: number) => {
    const base = Number.isFinite(dayStart) ? dayStart : Date.now()
    onDayChange(new Date(base + deltaDays * DAY_MS).toISOString().slice(0, 10))
  }

  const pickDay = (next: string) => {
    const nextStart = Date.parse(`${next}T00:00:00Z`)
    if (!Number.isFinite(nextStart)) return
    setPlaying(false)
    setWindowStart(nextStart)
    onDayChange(next)
  }

  const scrubValue = timeToSliderMinutes(windowStart, t)
  const scrubTo = (value: number) => {
    commitInstant(sliderMinutesToTime(windowStart, value), onDayChange, onMinutesChange)
  }

  return {
    windowStart,
    windowEnd,
    cycle,
    playing,
    setPlaying,
    loop,
    setLoop,
    scrubValue,
    scrubTo,
    pickDay,
    shiftDay,
  }
}
