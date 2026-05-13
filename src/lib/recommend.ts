/**
 * Recommendation engine: interpretable grouped means + correlations on
 * substance-paired nights. Nothing fancy — small sample sizes, sample size
 * shown on every claim, nothing surfaced for n<7. Pattern detection only,
 * not medical advice.
 */

import type { MedEntry } from './db';
import type { NightSummary } from './sleep-science';

export interface SubstanceInsight {
  substance: string;
  category: MedEntry['category'];
  nights: number;
  /** Mean TST on nights with this substance vs nights without (minutes). */
  meanTstWith: number;
  meanTstWithout: number;
  /** Mean awakenings, with vs without. */
  awakeningsWith: number;
  awakeningsWithout: number;
  /** Mean sleep efficiency, with vs without. */
  efficiencyWith: number;
  efficiencyWithout: number;
  /** Confidence note based on n. */
  note: string;
}

export interface OptimalBedtime {
  bedtimeHHMM: string;
  meanEfficiency: number;
  n: number;
  note: string;
}

export interface StackSuggestion {
  combination: string[];
  nights: number;
  meanTstHours: number;
  meanAwakenings: number;
  note: string;
}

export interface RedFlag {
  message: string;
  evidence: string;
}

const MIN_N = 7;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function noteForN(n: number): string {
  if (n < MIN_N) return `n=${n} (too few nights — directional only)`;
  if (n < 14) return `n=${n} (small sample, treat as suggestive)`;
  return `n=${n}`;
}

/** Index meds by sleep-day (date string). */
function medsByDate(meds: MedEntry[]): Map<string, MedEntry[]> {
  const map = new Map<string, MedEntry[]>();
  for (const m of meds) {
    const arr = map.get(m.date) ?? [];
    arr.push(m);
    map.set(m.date, arr);
  }
  return map;
}

export function substanceInsights(
  nights: NightSummary[],
  meds: MedEntry[]
): SubstanceInsight[] {
  if (nights.length < MIN_N) return [];
  const byDate = medsByDate(meds);
  const allSubstances = Array.from(new Set(meds.map(m => m.substance))).filter(Boolean);
  const out: SubstanceInsight[] = [];

  for (const substance of allSubstances) {
    const withN: NightSummary[] = [];
    const withoutN: NightSummary[] = [];
    const category =
      meds.find(m => m.substance === substance)?.category ?? 'other';
    for (const n of nights) {
      const today = byDate.get(n.date) ?? [];
      if (today.some(m => m.substance === substance)) withN.push(n);
      else withoutN.push(n);
    }
    if (withN.length < MIN_N) continue;

    out.push({
      substance,
      category,
      nights: withN.length,
      meanTstWith: mean(withN.map(n => n.tst * 60)),
      meanTstWithout: mean(withoutN.map(n => n.tst * 60)),
      awakeningsWith: mean(withN.map(n => n.awakenings)),
      awakeningsWithout: mean(withoutN.map(n => n.awakenings)),
      efficiencyWith: mean(withN.map(n => n.efficiency)),
      efficiencyWithout: mean(withoutN.map(n => n.efficiency)),
      note: noteForN(withN.length),
    });
  }

  return out.sort(
    (a, b) => Math.abs(b.meanTstWith - b.meanTstWithout) - Math.abs(a.meanTstWith - a.meanTstWithout)
  );
}

/** Bedtime buckets by 30-min slot; returns the bucket with highest mean efficiency. */
export function optimalBedtime(nights: NightSummary[]): OptimalBedtime | null {
  if (nights.length < MIN_N) return null;
  // Bucket key: HH:MM rounded to nearest 30m
  const buckets = new Map<string, number[]>();
  for (const n of nights) {
    const d = new Date(n.onset);
    const minute = d.getMinutes() < 30 ? 0 : 30;
    const key = `${String(d.getHours()).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const arr = buckets.get(key) ?? [];
    arr.push(n.efficiency);
    buckets.set(key, arr);
  }
  let best: OptimalBedtime | null = null;
  for (const [key, effs] of buckets) {
    if (effs.length < 3) continue;
    const m = mean(effs);
    if (!best || m > best.meanEfficiency) {
      best = { bedtimeHHMM: key, meanEfficiency: m, n: effs.length, note: noteForN(effs.length) };
    }
  }
  return best;
}

/**
 * "Med stack" suggestion: of all combinations of substances actually taken
 * together on the same night, the one with the longest mean TST and fewest
 * awakenings. Tiny dataset → keep combinations small (sorted-unique key).
 */
export function bestStack(
  nights: NightSummary[],
  meds: MedEntry[]
): StackSuggestion | null {
  if (nights.length < MIN_N) return null;
  const byDate = medsByDate(meds);
  const combos = new Map<string, { tst: number[]; awk: number[] }>();
  for (const n of nights) {
    const today = byDate.get(n.date) ?? [];
    const key = Array.from(new Set(today.map(m => m.substance))).filter(Boolean).sort().join(' + ');
    if (!key) continue;
    const c = combos.get(key) ?? { tst: [], awk: [] };
    c.tst.push(n.tst);
    c.awk.push(n.awakenings);
    combos.set(key, c);
  }
  let best: StackSuggestion | null = null;
  for (const [key, c] of combos) {
    if (c.tst.length < MIN_N) continue;
    const tstM = mean(c.tst);
    const awkM = mean(c.awk);
    // Score: prioritize TST, lightly penalize awakenings.
    const score = tstM - 0.1 * awkM;
    const bestScore = best ? best.meanTstHours - 0.1 * best.meanAwakenings : -Infinity;
    if (score > bestScore) {
      best = {
        combination: key.split(' + '),
        nights: c.tst.length,
        meanTstHours: tstM,
        meanAwakenings: awkM,
        note: noteForN(c.tst.length),
      };
    }
  }
  return best;
}

/** Plain-text pattern flags. Pattern detection only, no medical framing. */
export function redFlags(nights: NightSummary[], meds: MedEntry[]): RedFlag[] {
  const flags: RedFlag[] = [];
  if (nights.length < MIN_N) return flags;
  const byDate = medsByDate(meds);

  // Stimulant after 2pm vs efficiency
  const lateStim: NightSummary[] = [];
  const noLateStim: NightSummary[] = [];
  for (const n of nights) {
    const todays = byDate.get(n.date) ?? [];
    const hasLateStim = todays.some(
      m => m.category === 'stimulant' && new Date(m.takenAt).getHours() >= 14
    );
    if (hasLateStim) lateStim.push(n);
    else noLateStim.push(n);
  }
  if (lateStim.length >= MIN_N) {
    const dEff = mean(lateStim.map(n => n.efficiency)) - mean(noLateStim.map(n => n.efficiency));
    if (dEff < -0.02) {
      flags.push({
        message: 'Stimulant after 2pm is correlated with worse sleep efficiency.',
        evidence: `${(dEff * 100).toFixed(1)}% lower efficiency on those nights (n=${lateStim.length})`,
      });
    }
  }

  // Sleep aid + long latency
  const onsetLate: NightSummary[] = [];
  for (const n of nights) {
    const todays = byDate.get(n.date) ?? [];
    const tookSleepAid = todays.some(m => m.category === 'sleep aid');
    const onsetH = new Date(n.onset).getHours();
    if (tookSleepAid && (onsetH >= 1 && onsetH <= 4)) onsetLate.push(n);
  }
  if (onsetLate.length >= MIN_N) {
    flags.push({
      message: 'Sleep aids logged on nights with very late onset (1–4am).',
      evidence: `${onsetLate.length} nights matched`,
    });
  }

  return flags;
}
