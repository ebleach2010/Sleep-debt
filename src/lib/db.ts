/**
 * IndexedDB schema (Dexie). Single-user, single-device. No cloud sync.
 */
import Dexie, { type EntityTable } from 'dexie';
import type { NightSummary } from './sleep-science';

export interface MedEntry {
  id?: number;
  date: string; // sleep-day key the entry should be associated with
  takenAt: number; // epoch ms
  substance: string;
  doseMg?: number;
  category: 'stimulant' | 'sleep aid' | 'antidepressant' | 'other';
  note?: string;
}

export interface SubstanceMeta {
  name: string; // PK
  category: MedEntry['category'];
  lastUsed: number;
}

export interface Settings {
  id: 'singleton';
  sleepNeedH: number;
  bodyweightLb: number;
  cutoffHour: number;
  lastExportName?: string;
  lastExportRaw?: string; // we keep the last raw XML so the Refresh button can reparse
  lastImportAt?: number;
}

export interface Night extends NightSummary {}

class SleepDB extends Dexie {
  nights!: EntityTable<Night, 'date'>;
  meds!: EntityTable<MedEntry, 'id'>;
  substances!: EntityTable<SubstanceMeta, 'name'>;
  settings!: EntityTable<Settings, 'id'>;

  constructor() {
    super('sleep-debt');
    this.version(1).stores({
      nights: 'date',
      meds: '++id, date, substance, category',
      substances: 'name, category',
      settings: 'id',
    });
  }
}

export const db = new SleepDB();

export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get('singleton');
  if (existing) return existing;
  const fresh: Settings = {
    id: 'singleton',
    sleepNeedH: 8.0,
    bodyweightLb: 180,
    cutoffHour: 18,
  };
  await db.settings.put(fresh);
  return fresh;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const cur = await getSettings();
  const next = { ...cur, ...patch, id: 'singleton' as const };
  await db.settings.put(next);
  return next;
}

export async function replaceNights(nights: NightSummary[]): Promise<void> {
  await db.transaction('rw', db.nights, async () => {
    await db.nights.clear();
    if (nights.length) await db.nights.bulkPut(nights);
  });
}

export async function exportAll(): Promise<string> {
  const [nights, meds, substances, settings] = await Promise.all([
    db.nights.toArray(),
    db.meds.toArray(),
    db.substances.toArray(),
    db.settings.toArray(),
  ]);
  return JSON.stringify(
    { schema: 1, exportedAt: Date.now(), nights, meds, substances, settings },
    null,
    2
  );
}
