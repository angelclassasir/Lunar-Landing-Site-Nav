import { useMemo } from 'react'
import MissionPlanner from '../components/MissionPlanner'
import MoonGlobe from '../components/MoonGlobe'
import SkyView from '../components/SkyView'
import ArrayCard from '../components/ArrayPower'
import TimeScrubber from '../components/TimeScrubber'
import VisibilityCycle from '../components/VisibilityCycle'
import { commitInstant, useScrubber } from '../hooks/useScrubber'
import { usePassPeriods } from '../hooks/usePassPeriods'
import { bestFixedPanel, compassPoint16 } from '../lib/astro/panel'
import { buildTimeline } from '../lib/astro/timeline'
import { createObserver } from '../lib/astro/observer'
import { SITES, customSite, isTerrainCritical } from '../lib/astro/sites'
import { DAY_MS } from '../lib/astro/scrub'
import type { HorizonProfile, LunarSite } from '../lib/astro/types'
import { formatCoord, formatHours, formatUtc } from '../lib/format'

export interface ExplorerModeProps {
  site: LunarSite
  onSiteChange: (site: LunarSite) => void
  /** 'YYYY-MM-DD' UTC */
  day: string
  onDayChange: (day: string) => void
  /** Minutes after midnight UTC, 0..1435 */
  minutesOfDay: number
  onMinutesChange: (minutes: number) => void
  /** Shared instant, UTC epoch ms */
  t: number
}

const RAD = Math.PI / 180
const NEAR_SITE_DEG = 3

/** Sun icon: disc with rays. */
function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.1" />
      <path d="M12 2.2v2.1M12 19.7v2.1M2.2 12h2.1M19.7 12h2.1M4.9 4.9l1.5 1.5M17.6 17.6l1.5 1.5M19.1 4.9l-1.5 1.5M6.4 17.6l-1.5 1.5" />
    </svg>
  )
}

/** Earth icon: disc with simplified continents. */
function EarthIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M3.8 10.2h4.1l1.7 2.1 2.4-.8 1.3 1.9 2.9.4 1.9-2h2.1" />
      <path d="M7.2 5.7l1.9 2.3 2.3.3 1.4-1.7" />
      <path d="M8.1 18.4l1-2.3 2.5-1 1.8 1.4 2.1-.5" />
    </svg>
  )
}

/** Great-circle separation, degrees. */
function angularDistanceDeg(a: LunarSite, b: LunarSite): number {
  const la1 = a.lat * RAD
  const la2 = b.lat * RAD
  const dLon = (b.lon - a.lon) * RAD
  const cosine = Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dLon)
  return Math.acos(Math.min(1, Math.max(-1, cosine))) / RAD
}

export default function ExplorerMode({
  site,
  onSiteChange,
  day,
  onDayChange,
  onMinutesChange,
  t,
}: ExplorerModeProps) {
  const observer = useMemo(() => createObserver(site), [site])
  const sky = useMemo(() => observer.skyAt(t), [observer, t])

  const dayStart = useMemo(() => Date.parse(`${day}T00:00:00Z`), [day])
  // One day at 10 min resolution: only recomputed when the site or day changes.
  const daily = useMemo(
    () => buildTimeline(site, dayStart, dayStart + DAY_MS, 600_000).metrics,
    [site, dayStart],
  )

  const scrubber = useScrubber({ site, day, onDayChange, onMinutesChange, t })
  const { windowEnd, cycle, setPlaying } = scrubber
  // Hourly periods over the 60-day look-ahead: rebuilt only when the site or
  // the scrub window moves, never on scrub.
  const passes = usePassPeriods(site, scrubber.windowStart)

  // Best fixed panel over the 30-day window (shared model with Expert mode).
  const fixedPanel = useMemo(() => bestFixedPanel(cycle.samples), [cycle])

  const nearest = useMemo(() => {
    let best: { site: LunarSite; distance: number } | null = null
    for (const candidate of SITES) {
      const distance = angularDistanceDeg(site, candidate)
      if (!best || distance < best.distance) best = { site: candidate, distance }
    }
    return best && best.distance <= NEAR_SITE_DEG ? best.site : null
  }, [site])

  const earthUp = sky.earthVisible
  // A Sun whose centre sits just below the horizon can still be half visible
  // at the poles, so "up" means the upper limb is above the horizon.
  const sunUp = sky.sunlit
  // The skyline is the terrain profile when it is loaded, otherwise the flat
  // tangent-plane dip. Clearance is what the eye actually has to work with.
  const profile = site.horizon
  const flatDip = sky.horizonDipDeg ?? 0
  const sunHorizon = sky.sun.horizonDeg ?? -flatDip
  const earthHorizon = sky.earth.horizonDeg ?? -flatDip
  const sunClearance = sky.sun.elevation - sunHorizon
  const earthClearance = sky.earth.elevation - earthHorizon
  const sunPartial = sunUp && sunClearance < sky.sun.angularDiameterDeg / 2
  const terrainCritical = isTerrainCritical(site)
  const earthDegrees = Math.max(0, earthClearance).toFixed(1)
  const sunDegrees = Math.max(0, sunClearance).toFixed(1)

  return (
    <div className="explorer">
      <section className="atlas-intro" aria-labelledby="atlas-title">
        <div>
          <p className="atlas-kicker">LUNAR SURFACE OPERATIONS <span>·</span> EXPLORER</p>
          <h2 id="atlas-title">Find the light.<br /><em>Keep Earth in view.</em></h2>
          <p className="atlas-deck">Compare landing sites against the lunar horizon, sunlight and direct-to-Earth visibility.</p>
        </div>
        <p className="atlas-index"><span>01</span> SITE CONDITIONS<br /><span>02</span> MISSION WINDOW</p>
      </section>
      <section className="controls explorer-site-picker">
        <label className="field">Landing site
          <select value={SITES.some(s => s.id === site.id) ? site.id : 'custom'} onChange={e => {
            const selected = SITES.find(s => s.id === e.target.value)
            if (selected) onSiteChange(selected)
          }}>
            {!SITES.some(s => s.id === site.id) && <option value="custom">Custom point</option>}
            {SITES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <p>Choose a mission site, or click the Moon to explore any location. Drag to rotate.</p>
      </section>
      <section className="chart-card explorer-hero">
        <MoonGlobe
          sites={SITES}
          selected={site}
          onPick={(lat, lon) => onSiteChange(customSite(lat, lon))}
          richMarkers
          focused={Boolean(site)}
          onSelectSite={onSiteChange}
        />
        <div className="explorer-picked">
          <strong>{formatCoord(site.lat, site.lon)}</strong>
          <span>{nearest ? nearest.name : 'Custom point'}</span>
        </div>
        <p className="globe-caption">Moon map: NASA&apos;s Scientific Visualization Studio / LRO</p>
      </section>

      <aside className="explorer-side">
        <article className={`verdict verdict--earth ${earthUp ? 'is-up' : 'is-down'}`}>
          <div className="verdict-icon" aria-hidden="true">
            <EarthIcon />
          </div>
          <div className="verdict-body">
            <div className="verdict-top">
              <h3>Earth</h3>
              <span className="verdict-state">{earthUp ? 'Visible' : 'Not visible'}</span>
            </div>
            <p>
              {earthUp
                ? `Earth is ${earthDegrees}° above the local skyline, so there is a clear line of sight.`
                : sky.earth.elevation > 0
                  ? 'Earth is up, but the terrain skyline hides it, so there is no direct line of sight.'
                  : `Earth is ${Math.abs(sky.earth.elevation).toFixed(
                      1,
                    )}° below the horizon, no direct line of sight.`}
            </p>
            <VisibilityCycle variant="plain" t={t} kind="earth" periods={passes.earth} />
          </div>
        </article>

        <article className={`verdict verdict--sun ${sunUp ? 'is-up' : 'is-down'}`}>
          <div className="verdict-icon" aria-hidden="true">
            <SunIcon />
          </div>
          <div className="verdict-body">
            <div className="verdict-top">
              <h3>Sun</h3>
              <span className="verdict-state">{sunUp ? 'Visible' : 'Not visible'}</span>
            </div>
            <p>
              {sunUp
                ? sunPartial
                  ? 'The Sun is only partly above the local skyline: panels get some light, and a vertical panel facing it gets the most.'
                  : `The Sun is ${sunDegrees}° above the local skyline, so solar panels get light.`
                : sky.sun.elevation > 0
                  ? 'The Sun is up, but the terrain skyline hides it, so the site is in shadow.'
                  : 'The Sun is below the horizon, so it is night here.'}
            </p>
            <VisibilityCycle variant="plain" t={t} kind="sun" periods={passes.sun} />
          </div>
        </article>

        {terrainCritical && (
          <p className="terrain-warning">
            {profile
              ? `Polar site: the Sun and Earth skim the horizon, so relief decides what you see. The skyline here comes from the LOLA elevation grid: it rises ${profile.maxElevationDeg.toFixed(
                  1,
                )}° towards ${compassPoint16(profile.maxAzimuthDeg)}, ${profile.maxDistanceKm.toFixed(
                  0,
                )} km away, and averages ${averageHorizon(profile).toFixed(1)}° around the horizon.`
              : 'Polar site: the Sun and Earth skim the horizon, so nearby hills and crater walls decide what you really see. The elevation grid has not loaded, so these numbers assume flat ground; ridges can be lit most of the time and crater floors never.'}
          </p>
        )}

        <p className="daily-summary">
          Earth is visible {formatHours(daily.commMs)} of this day, the Sun{' '}
          {formatHours(daily.sunlitMs)}
        </p>

        <ArrayCard
          site={site}
          t={t}
          rangeLabel="this 30-day window"
          rows={arrayRows(cycle.metrics, fixedPanel)}
        />

        <section className="chart-card explorer-sky">
          <div className="chart-head">
            <div>
              <h2>What you would see</h2>
              <p>
                {formatUtc(t, { seconds: true })} · {formatCoord(site.lat, site.lon)}
              </p>
            </div>
          </div>
          <SkyView site={site} t={t} />
        </section>
      </aside>

      <MissionPlanner site={site} windows={cycle.jointWindows} now={t} end={windowEnd}
        onJump={next => { setPlaying(false); commitInstant(next, onDayChange, onMinutesChange) }} />

      <section className="controls explorer-controls">
        <TimeScrubber scrubber={scrubber} t={t} day={day} />
      </section>
    </div>
  )
}

/** Tracking / best fixed / flat average power for the array card. */
function arrayRows(
  metrics: { meanTrackingFluxWm2: number; meanFlatFluxWm2: number },
  fixed: { tiltDeg: number; azimuthDeg: number; capturedPct: number },
) {
  return [
    { label: 'Tilts and turns to face the Sun', value: metrics.meanTrackingFluxWm2 },
    {
      label: `Best fixed panel (${fixed.tiltDeg}° tilt, ${fixed.azimuthDeg}°)`,
      value: (metrics.meanTrackingFluxWm2 * fixed.capturedPct) / 100,
    },
    { label: 'Flat on the deck', value: metrics.meanFlatFluxWm2 },
  ]
}

/** Mean skyline elevation over all azimuths, deg: how enclosed the site is. */
function averageHorizon(profile: HorizonProfile): number {
  let sum = 0
  for (const elevation of profile.elevations) sum += elevation
  return sum / Math.max(1, profile.elevations.length)
}
