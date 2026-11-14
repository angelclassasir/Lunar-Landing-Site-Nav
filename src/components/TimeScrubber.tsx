import type { Scrubber } from '../hooks/useScrubber'
import {
  DAY_MS,
  SCRUB_DAYS,
  SCRUB_MAX_MIN,
  SCRUB_SPAN_MS,
  windowPercent,
} from '../lib/astro/scrub'
import type { TimeWindow } from '../lib/astro/types'
import { formatInstant, formatMonthDay } from '../lib/format'

/** Date tick every five days, including both window ends. */
const TICK_OFFSET_DAYS = Array.from({ length: SCRUB_DAYS / 5 + 1 }, (_, i) => i * 5)

export interface TimeScrubberProps {
  /** Result of useScrubber: window, playback toggles and the window timeline. */
  scrubber: Scrubber
  /** Shared instant, UTC epoch ms */
  t: number
  /** Shared day, 'YYYY-MM-DD' UTC */
  day: string
}

/**
 * The 30-day lunar-cycle scrubber: day picker, instant, play/pause, loop,
 * sunlight and Earth-visibility bands, date ticks and the range input.
 *
 * It owns no state; every value comes from useScrubber, so Explorer and Expert
 * can render the same control over their own window.
 */
export default function TimeScrubber({ scrubber, t, day }: TimeScrubberProps) {
  const { windowStart, cycle, playing, setPlaying, loop, setLoop, scrubValue, scrubTo, pickDay, shiftDay } =
    scrubber

  const segments = (windows: TimeWindow[], tone: 'sun' | 'earth') =>
    windows.map((w, i) => (
      <span
        key={`${tone}-${i}`}
        className={`scrub-seg scrub-seg-${tone}`}
        style={{
          left: `${windowPercent(windowStart, w.start)}%`,
          width: `${(w.durationMs / SCRUB_SPAN_MS) * 100}%`,
        }}
      />
    ))

  return (
    <>
      <div className="field">
        <span>Day (UTC)</span>
        <div className="day-row">
          <button onClick={() => shiftDay(-1)} aria-label="Previous day">
            −
          </button>
          <input type="date" value={day} onChange={(e) => pickDay(e.target.value)} />
          <button onClick={() => shiftDay(1)} aria-label="Next day">
            +
          </button>
        </div>
      </div>

      <div className="field explorer-scrub">
        <div className="scrub-head">
          <strong className="scrub-instant">{formatInstant(t)}</strong>
          <div className="scrub-actions">
            <button
              className={`scrub-play${playing ? ' is-playing' : ''}`}
              onClick={() => setPlaying((value) => !value)}
              aria-pressed={playing}
            >
              {playing ? (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <rect x="3.6" y="3" width="3.2" height="10" rx="1.1" />
                  <rect x="9.2" y="3" width="3.2" height="10" rx="1.1" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.9 2.9 12.8 8l-7.9 5.1Z" />
                </svg>
              )}
              <span>{playing ? 'Pause' : 'Play'}</span>
            </button>
            <label className="scrub-loop">
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} />
              Loop
            </label>
          </div>
        </div>

        <div className="scrub-grid">
          <span className="scrub-label">Sun</span>
          <div className="scrub-track" role="img" aria-label="Sunlight over the next 30 days">
            {segments(cycle.sunWindows, 'sun')}
          </div>

          <span className="scrub-label">Earth</span>
          <div className="scrub-track" role="img" aria-label="Earth visibility over the next 30 days">
            {segments(cycle.commWindows, 'earth')}
          </div>

          <span />
          <div className="scrub-ticks" aria-hidden="true">
            {TICK_OFFSET_DAYS.map((offsetDays, index) => {
              const edge =
                index === 0
                  ? ' is-first'
                  : index === TICK_OFFSET_DAYS.length - 1
                    ? ' is-last'
                    : ''
              return (
                <span
                  key={offsetDays}
                  className={`scrub-tick${edge}`}
                  style={{ left: `${(offsetDays / SCRUB_DAYS) * 100}%` }}
                >
                  {formatMonthDay(windowStart + offsetDays * DAY_MS)}
                </span>
              )
            })}
          </div>

          <span />
          <input
            className="scrub-range"
            type="range"
            min={0}
            max={SCRUB_MAX_MIN}
            step={1}
            value={scrubValue}
            onChange={(e) => scrubTo(Number(e.target.value))}
            onPointerDown={() => setPlaying(false)}
            aria-label="Time across the 30-day lunar cycle"
          />
        </div>
      </div>
    </>
  )
}
