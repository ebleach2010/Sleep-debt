/**
 * sleep-science.ts
 *
 * All literature-derived equations live in this file. Constants are exported so
 * the rest of the app references named values (auditable in the Settings UI).
 *
 * Sources:
 *  - Dawson & Reid (1997) "Fatigue, alcohol and performance impairment." Nature 388, 235.
 *      → 17h sustained wakefulness ≈ BAC 0.05%; 24h ≈ BAC 0.10%.
 *  - Van Dongen, Maislin, Mullington & Dinges (2003) Sleep 26(2):117–126.
 *      → Chronic restriction (6h/night × 14d) produces PVT deficits comparable
 *        to ~24h of total sleep deprivation. Recovery is non-linear and
 *        asymmetric (extra sleep does not 1:1 repay debt).
 *  - Belenky et al. (2003) J Sleep Res 12(1):1–12.
 *      → Partial recovery / physiological adaptation after ~2 weeks of restriction.
 *  - Roehrs & Roth (2008) Sleep Med Rev — diminishing returns on recovery sleep.
 *
 * None of this is medical advice. Constants are best-effort midpoints from the
 * literature; user-adjustable from Settings.
 */

// ---------- Constants (audit these against the cited papers above) ----------

/** Default personal sleep need (hours/night). Adjustable. */
export const DEFAULT_SLEEP_NEED_H = 8.0;

/**
 * Recovery coefficient for sleep beyond need.
 * One extra hour repays ~30 min of accumulated debt (Roehrs & Roth, Van Dongen).
 */
export const RECOVERY_COEFFICIENT = 0.5;

/** Maximum debt a single night of "extra" sleep can repay (hours). */
export const MAX_NIGHTLY_RECOVERY_H = 2.0;

/**
 * Debt older than this many days is partially discounted (Belenky adaptation).
 */
export const DEBT_DECAY_START_DAYS = 14;

/** Debt older than this is fully discounted. */
export const DEBT_DECAY_END_DAYS = 30;

/**
 * Multiplier applied to debt entries at the start of the decay window.
 * Linearly decays to 0 by DEBT_DECAY_END_DAYS.
 */
export const DEBT_DECAY_FACTOR_AT_START = 0.5;

/**
 * Dawson & Reid anchors. Linear interpolation between (17h → 0.05%) and
 * (24h → 0.10%) for sustained wakefulness; we extend the same slope below 17h
 * with a small baseline so well-rested people don't show ~0 impairment.
 */
export const DR_HOURS_AWAKE_LOW = 17;
export const DR_BAC_AT_LOW = 0.05;
export const DR_HOURS_AWAKE_HIGH = 24;
export const DR_BAC_AT_HIGH = 0.10;

/**
 * Per Van Dongen 2003: ~1 week of 6h/night (~14h cumulative debt) produces
 * deficits comparable to ~24h total sleep deprivation. We treat each 2h of
 * accumulated debt as adding ~1h of "effective wakefulness" on PVT outcomes.
 */
export const DEBT_TO_EFFECTIVE_WAKE_RATIO = 0.5; // h of extra wake per h of debt

/**
 * Beer model. Default body weight (lbs) and assumption that one standard US
 * beer (12oz, 5%) raises BAC by ~0.02% in a ~180lb person (Widmark estimate).
 * Adjustable.
 */
export const DEFAULT_BODYWEIGHT_LB = 180;
export const REFERENCE_BAC_PER_BEER_AT_REF_WEIGHT = 0.02;

// ---------- Types ----------

export interface NightSummary {
  /** Sleep-day key, ISO yyyy-mm-dd. See dateUtils for how we anchor sleep-days. */
  date: string;
  /** Total sleep time, hours. Asleep* records only (Awake/InBed excluded). */
  tst: number;
  /** Time in bed, hours. */
  tib: number;
  /** Sleep efficiency (TST / TIB), 0..1. */
  efficiency: number;
  /** Sleep onset (epoch ms) and wake time (epoch ms). */
  onset: number;
  wake: number;
  /** Count of awakenings (Awake records between asleep intervals). */
  awakenings: number;
  /** Stage breakdown if available (hours). */
  stages?: { core?: number; deep?: number; rem?: number; unspecified?: number };
}

export interface DebtOptions {
  sleepNeedH?: number;
  /** "today" anchor for decay calculations (ms). Defaults to Date.now(). */
  nowMs?: number;
}

// ---------- Cumulative sleep debt ----------

/**
 * Calculates cumulative sleep debt across a series of nightly summaries.
 *
 * Algorithm (chronological, oldest→newest):
 *   1. Nightly deficit = max(0, need - TST). Adds to running debt.
 *   2. Nightly surplus (TST - need, if > 0) repays debt at RECOVERY_COEFFICIENT,
 *      capped at MAX_NIGHTLY_RECOVERY_H per night.
 *   3. After all nights are processed, apply age-based decay so old debt
 *      doesn't pile up forever (Belenky-style adaptation). We track debt by
 *      origin-night so we can decay accurately.
 *
 * Returns total current debt in hours plus per-day delta for charting.
 */
export function computeSleepDebt(
  nights: NightSummary[],
  opts: DebtOptions = {}
): {
  currentDebtH: number;
  /** [{date, deltaH (negative = surplus), runningDebtH}] in chronological order. */
  series: { date: string; deltaH: number; runningDebtH: number }[];
} {
  const need = opts.sleepNeedH ?? DEFAULT_SLEEP_NEED_H;
  const nowMs = opts.nowMs ?? Date.now();
  const sorted = [...nights].sort((a, b) => a.date.localeCompare(b.date));

  // Track debt as a list of (originDate, hoursRemaining) lots so we can decay
  // by age. FIFO repayment: oldest debt is paid down first.
  type Lot = { date: string; hours: number };
  const lots: Lot[] = [];
  const series: { date: string; deltaH: number; runningDebtH: number }[] = [];

  for (const n of sorted) {
    const deficit = Math.max(0, need - n.tst);
    const surplus = Math.max(0, n.tst - need);

    if (deficit > 0) {
      lots.push({ date: n.date, hours: deficit });
    }
    if (surplus > 0) {
      let repay = Math.min(surplus * RECOVERY_COEFFICIENT, MAX_NIGHTLY_RECOVERY_H);
      while (repay > 0 && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.hours, repay);
        lot.hours -= take;
        repay -= take;
        if (lot.hours <= 1e-6) lots.shift();
      }
    }

    const runningRaw = lots.reduce((s, l) => s + l.hours, 0);
    series.push({ date: n.date, deltaH: need - n.tst, runningDebtH: runningRaw });
  }

  // Apply age-based decay against `nowMs`.
  const currentDebtH = lots.reduce((sum, lot) => {
    const ageDays = (nowMs - dateKeyToMs(lot.date)) / 86_400_000;
    return sum + lot.hours * ageDecayMultiplier(ageDays);
  }, 0);

  return { currentDebtH, series };
}

/**
 * 1.0 for fresh debt; linearly tapers from DEBT_DECAY_FACTOR_AT_START at
 * DEBT_DECAY_START_DAYS down to 0 at DEBT_DECAY_END_DAYS. Beyond that, 0.
 */
export function ageDecayMultiplier(ageDays: number): number {
  if (ageDays <= DEBT_DECAY_START_DAYS) return 1.0;
  if (ageDays >= DEBT_DECAY_END_DAYS) return 0;
  const span = DEBT_DECAY_END_DAYS - DEBT_DECAY_START_DAYS;
  const t = (ageDays - DEBT_DECAY_START_DAYS) / span; // 0..1
  // start at DEBT_DECAY_FACTOR_AT_START (0.5), end at 0
  return DEBT_DECAY_FACTOR_AT_START * (1 - t);
}

/**
 * "To fully repay you need ~X nights of Y hours" — given current debt and a
 * target nightly sleep amount above need, how many nights until cleared?
 * Honors MAX_NIGHTLY_RECOVERY_H cap.
 */
export function nightsToRepay(
  currentDebtH: number,
  targetNightlyH: number,
  needH: number = DEFAULT_SLEEP_NEED_H
): number {
  const surplus = Math.max(0, targetNightlyH - needH);
  const perNight = Math.min(surplus * RECOVERY_COEFFICIENT, MAX_NIGHTLY_RECOVERY_H);
  if (perNight <= 0 || currentDebtH <= 0) return 0;
  return Math.ceil(currentDebtH / perNight);
}

// ---------- BAC equivalent ("beers of impairment") ----------

/**
 * Maps sustained wakefulness (hours) to an effective BAC % using the Dawson &
 * Reid anchors. Linearly extrapolates outside (17,24).
 */
export function hoursAwakeToBac(hoursAwake: number): number {
  const slope =
    (DR_BAC_AT_HIGH - DR_BAC_AT_LOW) / (DR_HOURS_AWAKE_HIGH - DR_HOURS_AWAKE_LOW);
  const bac = DR_BAC_AT_LOW + slope * (hoursAwake - DR_HOURS_AWAKE_LOW);
  return Math.max(0, bac);
}

/**
 * Combines current debt and hours-since-waking into an effective BAC. Debt is
 * converted into "extra effective wakefulness" using DEBT_TO_EFFECTIVE_WAKE_RATIO,
 * then added to actual hours awake before applying the Dawson & Reid mapping.
 */
export function impairmentBac(
  currentDebtH: number,
  hoursAwakeToday: number
): { effectiveHoursAwake: number; bacPct: number } {
  const corrected = hoursAwakeToday + currentDebtH * DEBT_TO_EFFECTIVE_WAKE_RATIO;
  return { effectiveHoursAwake: corrected, bacPct: hoursAwakeToBac(corrected) };
}

/**
 * Convert effective BAC to standard-beer equivalents, scaled for bodyweight.
 * A lighter person reaches the same BAC with fewer beers, so per-beer BAC is
 * REFERENCE_BAC_PER_BEER × (REF_WEIGHT / actual_weight).
 */
export function bacToBeers(bacPct: number, bodyweightLb: number = DEFAULT_BODYWEIGHT_LB): number {
  const perBeer =
    REFERENCE_BAC_PER_BEER_AT_REF_WEIGHT * (DEFAULT_BODYWEIGHT_LB / Math.max(80, bodyweightLb));
  return bacPct / perBeer;
}

// ---------- PVT / "hours awake" equivalent ----------

/**
 * Translates current debt into the wakefulness duration that would produce
 * comparable PVT performance.
 *
 * "0 debt = hours since you woke up today" (per spec). Anchor on hoursAwakeToday
 * and add the debt-derived extra effective wakefulness.
 */
export function effectiveHoursAwake(
  currentDebtH: number,
  hoursAwakeToday: number
): number {
  return hoursAwakeToday + currentDebtH * DEBT_TO_EFFECTIVE_WAKE_RATIO;
}

// ---------- Helpers ----------

function dateKeyToMs(key: string): number {
  // key is yyyy-mm-dd. Anchor at noon local to avoid TZ edge weirdness.
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).getTime();
}

export const _debug = { dateKeyToMs };
