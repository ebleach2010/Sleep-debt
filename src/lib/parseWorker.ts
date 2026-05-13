/// <reference lib="webworker" />
/**
 * Web Worker entrypoint for parsing Apple Health exports off the main thread.
 * Input message: { kind: 'parse', xml: string, cutoffHour: number }
 * Output message: { kind: 'result', nights: NightSummary[] } | { kind: 'error', message: string }
 */
import { parseHealthExport } from './healthParser';

self.onmessage = (e: MessageEvent) => {
  const data = e.data as { kind: 'parse'; xml: string; cutoffHour: number };
  if (data?.kind !== 'parse') return;
  try {
    const nights = parseHealthExport(data.xml, data.cutoffHour);
    (self as unknown as Worker).postMessage({ kind: 'result', nights });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

export {};
