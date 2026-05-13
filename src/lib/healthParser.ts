/**
 * Apple Health export parser.
 *
 * Input: the export.xml file from an Apple Health export (or extracted from
 * export.zip — the UI does the unzip). We do streaming-ish parsing via regex
 * over a string for simplicity; for typical exports (10–500 MB) running in a
 * Web Worker this is fast enough and avoids pulling in a full XML library.
 *
 * Records we care about:
 *   <Record type="HKCategoryTypeIdentifierSleepAnalysis"
 *           value="HKCategoryValueSleepAnalysis{InBed|AsleepUnspecified|AsleepCore|AsleepDeep|AsleepREM|Awake}"
 *           startDate="..." endDate="..." ... />
 *
 * Apple Watch writes multiple overlapping records per night (one per stage,
 * sometimes one per source). We compute per-night TST as the UNION of all
 * Asleep* intervals (no double-counting), and stage breakdowns as per-stage
 * union durations.
 */

import { hoursBetween, SLEEP_DAY_CUTOFF_HOUR, toSleepDayKey } from './dateUtils';
import type { NightSummary } from './sleep-science';

export type SleepStage =
  | 'InBed'
  | 'AsleepUnspecified'
  | 'AsleepCore'
  | 'AsleepDeep'
  | 'AsleepREM'
  | 'Awake';

interface RawRecord {
  stage: SleepStage;
  start: number;
  end: number;
}

const ASLEEP_STAGES: SleepStage[] = [
  'AsleepUnspecified',
  'AsleepCore',
  'AsleepDeep',
  'AsleepREM',
];

const STAGE_MAP: Record<string, SleepStage> = {
  'HKCategoryValueSleepAnalysisInBed': 'InBed',
  'HKCategoryValueSleepAnalysisAsleepUnspecified': 'AsleepUnspecified',
  'HKCategoryValueSleepAnalysisAsleep': 'AsleepUnspecified', // legacy
  'HKCategoryValueSleepAnalysisAsleepCore': 'AsleepCore',
  'HKCategoryValueSleepAnalysisAsleepDeep': 'AsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM': 'AsleepREM',
  'HKCategoryValueSleepAnalysisAwake': 'Awake',
};

/** Parse all sleep records out of the export XML string. */
export function parseSleepRecords(xml: string): RawRecord[] {
  const records: RawRecord[] = [];
  // Match Record tags whose type contains SleepAnalysis. We keep the regex narrow
  // by anchoring to the relevant type to skip the millions of step-count records.
  const re =
    /<Record[^>]*\btype="HKCategoryTypeIdentifierSleepAnalysis"[^>]*\bvalue="([^"]+)"[^>]*\bstartDate="([^"]+)"[^>]*\bendDate="([^"]+)"[^>]*\/?>/g;
  // Attribute order in the export is not guaranteed; try the canonical order
  // first, then fall back to a more permissive parse.
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const stage = STAGE_MAP[m[1]];
    if (!stage) continue;
    const start = Date.parse(m[2]);
    const end = Date.parse(m[3]);
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
    records.push({ stage, start, end });
  }

  if (records.length === 0) {
    // Fallback: scan all SleepAnalysis records regardless of attribute order.
    const re2 = /<Record\b([^>]*?HKCategoryTypeIdentifierSleepAnalysis[^>]*)\/?>/g;
    let mm: RegExpExecArray | null;
    while ((mm = re2.exec(xml)) !== null) {
      const attrs = mm[1];
      const v = /\bvalue="([^"]+)"/.exec(attrs)?.[1];
      const s = /\bstartDate="([^"]+)"/.exec(attrs)?.[1];
      const e = /\bendDate="([^"]+)"/.exec(attrs)?.[1];
      if (!v || !s || !e) continue;
      const stage = STAGE_MAP[v];
      if (!stage) continue;
      const start = Date.parse(s);
      const end = Date.parse(e);
      if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;
      records.push({ stage, start, end });
    }
  }

  return records;
}

/** Merge overlapping intervals; returns disjoint sorted [start,end] pairs. */
export function unionIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [sorted[0].slice() as [number, number]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = out[out.length - 1];
    if (cur[0] <= last[1]) {
      last[1] = Math.max(last[1], cur[1]);
    } else {
      out.push([cur[0], cur[1]]);
    }
  }
  return out;
}

function totalHours(intervals: Array<[number, number]>): number {
  return intervals.reduce((s, [a, b]) => s + hoursBetween(a, b), 0);
}

/**
 * Group records into nights by sleep-day, dedupe overlaps per stage, and
 * compute NightSummary entries.
 */
export function summarizeNights(
  records: RawRecord[],
  cutoffHour = SLEEP_DAY_CUTOFF_HOUR
): NightSummary[] {
  const byDay = new Map<string, RawRecord[]>();
  for (const r of records) {
    const key = toSleepDayKey(r.start, cutoffHour);
    const arr = byDay.get(key) ?? [];
    arr.push(r);
    byDay.set(key, arr);
  }

  const out: NightSummary[] = [];
  for (const [date, recs] of byDay) {
    const asleep = unionIntervals(
      recs.filter(r => ASLEEP_STAGES.includes(r.stage)).map(r => [r.start, r.end])
    );
    if (asleep.length === 0) continue; // skip nights with only InBed/Awake
    const inBed = unionIntervals(
      recs
        .filter(r => r.stage === 'InBed' || ASLEEP_STAGES.includes(r.stage) || r.stage === 'Awake')
        .map(r => [r.start, r.end])
    );
    const awake = unionIntervals(recs.filter(r => r.stage === 'Awake').map(r => [r.start, r.end]));

    // Stage durations (union per stage so overlapping records from multiple
    // sources don't double-count).
    const stages = {
      core: totalHours(unionIntervals(recs.filter(r => r.stage === 'AsleepCore').map(r => [r.start, r.end]))),
      deep: totalHours(unionIntervals(recs.filter(r => r.stage === 'AsleepDeep').map(r => [r.start, r.end]))),
      rem: totalHours(unionIntervals(recs.filter(r => r.stage === 'AsleepREM').map(r => [r.start, r.end]))),
      unspecified: totalHours(
        unionIntervals(recs.filter(r => r.stage === 'AsleepUnspecified').map(r => [r.start, r.end]))
      ),
    };

    const tst = totalHours(asleep);
    const tib = totalHours(inBed.length ? inBed : asleep);
    const onset = asleep[0][0];
    const wake = asleep[asleep.length - 1][1];
    // Count awakenings as Awake intervals strictly between the first onset
    // and final wake of the night.
    const awakenings = awake.filter(([a, b]) => a > onset && b < wake).length;

    out.push({
      date,
      tst,
      tib,
      efficiency: tib > 0 ? tst / tib : 0,
      onset,
      wake,
      awakenings,
      stages,
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** End-to-end convenience: XML string → NightSummary[]. */
export function parseHealthExport(xml: string, cutoffHour = SLEEP_DAY_CUTOFF_HOUR): NightSummary[] {
  return summarizeNights(parseSleepRecords(xml), cutoffHour);
}
