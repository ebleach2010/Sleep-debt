/**
 * Sleep-day definition: a sleep session is attributed to the calendar date on
 * which the WAKE happened. Sessions whose midpoint is before 6am are attributed
 * to that calendar date; this avoids the "I went to bed at 11pm Tuesday and
 * woke up Wednesday" ambiguity by always tagging Wednesday.
 *
 * Effectively: cutoff = 18:00 (6pm) local time. Any sleep interval whose start
 * is ≥18:00 on day D rolls onto day D+1; intervals starting <18:00 stay on D.
 */

export const SLEEP_DAY_CUTOFF_HOUR = 18;

export function toSleepDayKey(epochMs: number, cutoffHour = SLEEP_DAY_CUTOFF_HOUR): string {
  const d = new Date(epochMs);
  if (d.getHours() >= cutoffHour) {
    d.setDate(d.getDate() + 1);
  }
  return ymd(d);
}

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(cutoffHour = SLEEP_DAY_CUTOFF_HOUR): string {
  return toSleepDayKey(Date.now(), cutoffHour);
}

export function hmm(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function hoursBetween(a: number, b: number): number {
  return (b - a) / 3_600_000;
}
