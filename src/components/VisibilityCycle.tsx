import { passAt, type PassView, type Period } from '../lib/astro/passes'
import { LOOK_AHEAD_DAYS } from '../hooks/usePassPeriods'
import { formatMonthDayTime, formatSpan } from '../lib/format'

type Kind = 'sun' | 'earth' | 'both'

/**
 * Every user-facing string of the cycle lives here, so the copy can be
 * reviewed in one place and the table and the verdict rows cannot drift apart.
 */
const TEXT = {
  cardTitle: 'Visibility cycle',
  cardHint: () =>
    `${LOOK_AHEAD_DAYS}-day look-ahead around the selected date · the Now column follows the clock`,
  cardFoot:
    'These are the real gaps: the Sun and the Earth keep their own clocks, and only when both are up can a site be powered and connected at the same time.',
  columns: {
    row: 'Visibility',
    now: 'Now',
    flip: 'Leaves / returns (UTC)',
    away: 'Away for',
    back: 'Back for',
    again: 'Leaves again (UTC)',
  },
  rows: {
    sun: 'Sun',
    earth: 'Earth',
    both: 'Sun + Earth together',
  },
  when: {
    cycle: 'Cycle',
    now: 'Now',
    next: 'Next',
    then: 'Then',
  },
  /** State words per subject. "rise"/"set" are the lowercase transitions. */
  state: {
    sun: { up: 'Daylight', down: 'Night', rise: 'daylight', set: 'night' },
    earth: { up: 'In view', down: 'Out of view', rise: 'in view', set: 'out of view' },
    both: { up: 'Both visible', down: 'Not both', rise: 'together', set: 'apart' },
  },
  flip: { up: 'Leaves', down: 'Returns' },
  dash: '—',
  /** Edge cases, in the subject's own words. */
  edge: {
    sun: {
      always: `Daylight for the whole ${LOOK_AHEAD_DAYS}-day look-ahead`,
      never: `Night for the whole ${LOOK_AHEAD_DAYS}-day look-ahead`,
    },
    earth: {
      always: `In view for the whole ${LOOK_AHEAD_DAYS}-day look-ahead`,
      never: `Not in view during the ${LOOK_AHEAD_DAYS}-day look-ahead`,
    },
    both: {
      always: `Both visible for the whole ${LOOK_AHEAD_DAYS}-day look-ahead`,
      never: `Not both visible during the ${LOOK_AHEAD_DAYS}-day look-ahead`,
    },
  },
  beyond: (span: string) => `more than ${span} (beyond the look-ahead)`,
  before: (span: string) => `more than ${span} (started before the look-ahead)`,
  beyondShort: 'beyond the look-ahead',
  outside: 'Outside the look-ahead',
  further: 'No further change in the look-ahead',
  none: 'none in the look-ahead',
  visible: (span: string, until: string) => `Visible ${span}, until ${until}`,
  visibleOpen: (span: string) => `Visible ${span}`,
  away: (span: string, back: string) => `Away ${span}, back ${back}`,
  awayOpen: (span: string) => `Away ${span}`,
  now: (state: string, move: string, span: string) => `${state} · ${move} in ${span}`,
  rowLabel: (kind: Kind) => `${TEXT.rows[kind]} visibility cycle`,
} as const

/** "Nov 29 20:46", from a period edge. Kept on one line with hard spaces. */
const momentShort = (t: number) => formatMonthDayTime(t).replaceAll(' ', '\u00a0')

/** Same, with the zone: the plain rows have no column header to carry it. */
const moment = (t: number) => `${momentShort(t)}\u00a0UTC`

/** Span across a period, or its lower bound when either edge is open. */
function duration(p: Period): string {
  const span = formatSpan(Math.max(0, p.end - p.start))
  return p.startKnown && p.endKnown ? span : TEXT.beyond(span)
}

/** Time until the current period flips, which may run past the look-ahead. */
function untilFlip(period: Period, t: number): string {
  const span = formatSpan(Math.max(0, period.end - t))
  return period.endKnown ? span : TEXT.beyond(span)
}

/** "Next"/"Then" copy for a following period, in plain words. */
function periodStep(period: Period): string {
  if (period.up) {
    return period.endKnown
      ? TEXT.visible(duration(period), moment(period.end))
      : TEXT.visibleOpen(duration(period))
  }
  return period.endKnown
    ? TEXT.away(duration(period), moment(period.end))
    : TEXT.awayOpen(duration(period))
}

export interface PlainCycleProps {
  variant: 'plain'
  /** Shared instant, UTC epoch ms */
  t: number
  kind: 'sun' | 'earth'
  /** Periods for this subject from usePassPeriods */
  periods: Period[]
}

export interface ExpertCycleProps {
  variant: 'expert'
  /** Shared instant, UTC epoch ms */
  t: number
  sun: Period[]
  earth: Period[]
  both: Period[]
}

export type VisibilityCycleProps = PlainCycleProps | ExpertCycleProps

export default function VisibilityCycle(props: VisibilityCycleProps) {
  return props.variant === 'expert' ? <ExpertCycle {...props} /> : <PlainCycle {...props} />
}

/* ------------------------------------------------------------------ plain */

/** Thin chevron between steps, in the same muted tone as the rest of the UI. */
function Arrow() {
  return (
    <svg className="cycle-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path
        d="M2.4 6h6.9M6.4 3.1 9.3 6l-2.9 2.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PlainCycle({ t, kind, periods }: PlainCycleProps) {
  const view = passAt(periods, t)

  if (!view) return <PlainStatement kind={kind} text={TEXT.outside} />
  if (view.always || view.never) {
    return (
      <PlainStatement
        kind={kind}
        text={TEXT.edge[kind][view.always ? 'always' : 'never']}
      />
    )
  }

  const steps: Array<{ when: string; text: string; current: boolean }> = [
    {
      when: TEXT.when.now,
      text: nowText(view, kind, t),
      current: true,
    },
    {
      when: TEXT.when.next,
      text: view.next ? periodStep(view.next) : TEXT.further,
      current: false,
    },
    {
      when: TEXT.when.then,
      text: view.afterNext ? periodStep(view.afterNext) : TEXT.further,
      current: false,
    },
  ]

  return (
    <div className="cycle-row cycle-row--plain" role="group" aria-label={TEXT.rowLabel(kind)}>
      {steps.map((step, index) => (
        <span key={step.when} className={`cycle-step${step.current ? ' is-current' : ''}`}>
          {index > 0 && <Arrow />}
          <span className="cycle-text">
            <span className="cycle-when">{step.when}</span>
            <span className="cycle-what">{step.text}</span>
          </span>
        </span>
      ))}
    </div>
  )
}

/** The single-sentence cases: visible all look-ahead, never, or off-range. */
function PlainStatement({ kind, text }: { kind: 'sun' | 'earth'; text: string }) {
  return (
    <div className="cycle-row cycle-row--plain" role="group" aria-label={TEXT.rowLabel(kind)}>
      <span className="cycle-step is-current">
        <span className="cycle-text">
          <span className="cycle-when">{TEXT.when.cycle}</span>
          <span className="cycle-what">{text}</span>
        </span>
      </span>
    </div>
  )
}

function nowText(view: PassView, kind: 'sun' | 'earth', t: number): string {
  const state = TEXT.state[kind]
  const current = view.current
  return current.up
    ? TEXT.now(state.up, state.set, untilFlip(current, t))
    : TEXT.now(state.down, state.rise, untilFlip(current, t))
}

/* ----------------------------------------------------------------- expert */

interface Cell {
  main: string
  sub?: string
}

interface Row {
  kind: Kind
  /** True when the row is a single sentence: visible or invisible all range. */
  only: boolean
  now: Cell
  flip: Cell
  away: Cell
  back: Cell
  again: Cell
}

function durationCell(period: Period | undefined, up: boolean): Cell {
  if (!period || period.up !== up) return { main: TEXT.dash, sub: TEXT.none }
  const span = formatSpan(Math.max(0, period.end - period.start))
  if (!period.endKnown) return { main: TEXT.beyond(span) }
  return period.startKnown ? { main: span } : { main: TEXT.before(span) }
}

function rowFor(kind: Kind, periods: Period[], t: number): Row {
  const state = TEXT.state[kind]
  const view = passAt(periods, t)
  const empty: Row = {
    kind,
    only: true,
    now: { main: TEXT.outside },
    flip: { main: TEXT.dash },
    away: { main: TEXT.dash },
    back: { main: TEXT.dash },
    again: { main: TEXT.dash },
  }
  if (!view) return empty
  if (view.always || view.never) {
    return {
      ...empty,
      now: { main: TEXT.edge[kind][view.always ? 'always' : 'never'] },
    }
  }

  const current = view.current
  // Where the current stretch ends: it sets (leaves) or it rises (returns).
  // The column header carries the zone, so the cell is just date and time.
  const flip: Cell = {
    main: current.up ? TEXT.flip.up : TEXT.flip.down,
    sub: current.endKnown ? momentShort(current.end) : TEXT.beyondShort,
  }

  // The nearest full cycle ahead: the current away stretch when we are down,
  // otherwise the one that follows this up stretch.
  const away = current.up ? view.next : current
  const back = current.up ? view.afterNext : view.next

  const again: Cell =
    back && back.up
      ? back.endKnown
        ? { main: momentShort(back.end) }
        : { main: TEXT.dash, sub: TEXT.beyondShort }
      : { main: TEXT.dash, sub: TEXT.none }

  return {
    kind,
    only: false,
    now: {
      main: current.up ? state.up : state.down,
      sub: `${current.up ? state.set : state.rise} in ${untilFlip(current, t)}`,
    },
    flip,
    away: durationCell(away, false),
    back: durationCell(back, true),
    again,
  }
}

function ExpertCycle({ t, sun, earth, both }: ExpertCycleProps) {
  const rows = [rowFor('sun', sun, t), rowFor('earth', earth, t), rowFor('both', both, t)]

  const cell = (value: Cell) => (
    <>
      <span className="cycle-cell-main">{value.main}</span>
      {value.sub && <span className="cycle-cell-sub">{value.sub}</span>}
    </>
  )

  return (
    <section className="chart-card cycle-card" aria-labelledby="cycle-title">
      <div className="chart-head">
        <div>
          <h2 id="cycle-title">{TEXT.cardTitle}</h2>
          <p>{TEXT.cardHint()}</p>
        </div>
      </div>

      <div className="cycle-scroll">
        <table className="cycle-table" aria-labelledby="cycle-title">
          <thead>
            <tr>
              <th scope="col">{TEXT.columns.row}</th>
              <th scope="col">{TEXT.columns.now}</th>
              <th scope="col">{TEXT.columns.flip}</th>
              <th scope="col">{TEXT.columns.away}</th>
              <th scope="col">{TEXT.columns.back}</th>
              <th scope="col">{TEXT.columns.again}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.kind}>
                <th scope="row">
                  <span className="cycle-subject">
                    <span className={`cycle-dot cycle-dot--${row.kind}`} aria-hidden="true" />
                    {TEXT.rows[row.kind]}
                  </span>
                </th>
                {row.only ? (
                  <td colSpan={5}>{cell(row.now)}</td>
                ) : (
                  <>
                    <td>{cell(row.now)}</td>
                    <td>{cell(row.flip)}</td>
                    <td>{cell(row.away)}</td>
                    <td>{cell(row.back)}</td>
                    <td>{cell(row.again)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="cycle-foot">{TEXT.cardFoot}</p>
    </section>
  )
}
