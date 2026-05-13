'use client';
import { useRef, useState } from 'react';
import { Button } from './ui';
import { extractXmlFromFile } from '@/lib/importExport';
import { db, getSettings, replaceNights, updateSettings } from '@/lib/db';

export function ImportButton({ onDone, label = 'Import export.zip / export.xml' }: { onDone: () => void; label?: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>('');

  async function handleFile(file: File) {
    setBusy(true);
    setProgress('Reading file…');
    try {
      const xml = await extractXmlFromFile(file);
      setProgress('Parsing sleep records…');
      const settings = await getSettings();
      const worker = new Worker(new URL('../lib/parseWorker.ts', import.meta.url), {
        type: 'module',
      });
      const nights: import('@/lib/sleep-science').NightSummary[] = await new Promise(
        (resolve, reject) => {
          worker.onmessage = e => {
            const d = e.data;
            if (d.kind === 'result') resolve(d.nights);
            else reject(new Error(d.message));
          };
          worker.onerror = e => reject(new Error(e.message));
          worker.postMessage({ kind: 'parse', xml, cutoffHour: settings.cutoffHour });
        }
      );
      worker.terminate();
      setProgress(`Saving ${nights.length} nights…`);
      await replaceNights(nights);
      await updateSettings({
        lastExportName: file.name,
        lastExportRaw: xml,
        lastImportAt: Date.now(),
      });
      setProgress('');
      onDone();
    } catch (err) {
      setProgress(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileRef}
        type="file"
        accept=".xml,.zip,application/zip,text/xml,application/xml"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          if (fileRef.current) fileRef.current.value = '';
        }}
      />
      <Button onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? 'Working…' : label}
      </Button>
      {progress && <div className="text-xs text-mute">{progress}</div>}
    </div>
  );
}

export function RefreshButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  async function refresh() {
    setBusy(true);
    setMsg('Re-parsing last export…');
    try {
      const settings = await getSettings();
      if (!settings.lastExportRaw) {
        setMsg('No previous import found. Use the import button.');
        return;
      }
      const worker = new Worker(new URL('../lib/parseWorker.ts', import.meta.url), {
        type: 'module',
      });
      const nights: import('@/lib/sleep-science').NightSummary[] = await new Promise(
        (resolve, reject) => {
          worker.onmessage = e => {
            const d = e.data;
            if (d.kind === 'result') resolve(d.nights);
            else reject(new Error(d.message));
          };
          worker.onerror = e => reject(new Error(e.message));
          worker.postMessage({ kind: 'parse', xml: settings.lastExportRaw, cutoffHour: settings.cutoffHour });
        }
      );
      worker.terminate();
      await replaceNights(nights);
      await db.settings.update('singleton', { lastImportAt: Date.now() });
      setMsg('');
      onDone();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button variant="ghost" onClick={refresh} disabled={busy}>
        {busy ? 'Refreshing…' : 'Refresh'}
      </Button>
      {msg && <div className="text-xs text-mute">{msg}</div>}
    </div>
  );
}
