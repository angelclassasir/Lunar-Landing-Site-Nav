import type { LunarSite } from './types'

/** Mean lunar radius, km (1737.4 km reference sphere). */
const MOON_RADIUS_KM = 1_737.4
const RAD = Math.PI / 180

export interface Alternative {
  site: LunarSite
  /** Great-circle distance from the selected site, rounded to whole km */
  km: number
}

export interface AlternativeOptions {
  /** Great-circle cut-off, km */
  maxKm?: number
  /** Maximum number of alternatives returned */
  max?: number
}

/** Great-circle distance between two selenographic points, km. */
function greatCircleKm(a: LunarSite, b: LunarSite): number {
  const la1 = a.lat * RAD
  const la2 = b.lat * RAD
  const dLon = (b.lon - a.lon) * RAD
  const cosine =
    Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dLon)
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * MOON_RADIUS_KM
}

/**
 * Nearby sites worth comparing with the selected one.
 *
 * Same-category sites come first (a crewed Apollo site next to another Apollo
 * site is the interesting comparison), then everything else, each group
 * ordered by great-circle distance. With no shared category — a custom point,
 * or a category with only one member — the list is simply the nearest sites.
 */
export function nearbyAlternatives(
  selected: LunarSite,
  catalog: LunarSite[],
  opts: AlternativeOptions = {},
): Alternative[] {
  const { maxKm = 400, max = 4 } = opts
  const candidates: Alternative[] = []

  for (const site of catalog) {
    if (site.id === selected.id) continue
    if (site.category === 'custom') continue
    const km = greatCircleKm(selected, site)
    if (km <= maxKm) candidates.push({ site, km })
  }

  const hasCategory = selected.category !== 'custom'
  const same = candidates
    .filter((candidate) => hasCategory && candidate.site.category === selected.category)
    .sort((a, b) => a.km - b.km)
  const rest = candidates
    .filter((candidate) => !hasCategory || candidate.site.category !== selected.category)
    .sort((a, b) => a.km - b.km)

  return [...same, ...rest]
    .slice(0, Math.max(0, max))
    .map((candidate) => ({ site: candidate.site, km: Math.round(candidate.km) }))
}
