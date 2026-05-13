'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useMemo } from 'react';
import { db, type MedEntry, type SubstanceMeta } from '@/lib/db';
import { Button, Card, Field, Input, Select } from './ui';
import { todayKey, SLEEP_DAY_CUTOFF_HOUR } from '@/lib/dateUtils';
import { bestStack, optimalBedtime, redFlags, substanceInsights } from '@/lib/recommend';

function fmtMin(m: number) {
  const sign = m >= 0 ? '+' : '−';
  return `${sign}${Math.abs(m).toFixed(0)} min`;
}

export function MedsSection() {
  const meds = useLiveQuery(() => db.meds.orderBy('id').reverse().toArray(), []) ?? [];
  const substances = useLiveQuery(() => db.substances.toArray(), []) ?? [];
  const nights = useLiveQuery(() => db.nights.toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.get('singleton'), []);

  const [substance, setSubstance] = useState('');
  const [doseMg, setDoseMg] = useState<string>('');
  const [takenAt, setTakenAt] = useState<string>(() => new Date().toISOString().slice(0, 16));
  const [category, setCategory] = useState<MedEntry['category']>('other');
  const [note, setNote] = useState('');

  const cutoff = settings?.cutoffHour ?? SLEEP_DAY_CUTOFF_HOUR;

  const handleSubstanceChange = (val: string) => {
    setSubstance(val);
    const existing = substances.find((s: SubstanceMeta) => s.name.toLowerCase() === val.toLowerCase());
    if (existing) setCategory(existing.category);
  };

  async function addEntry() {
    if (!substance.trim()) return;
    const t = new Date(takenAt).getTime();
    const entry: MedEntry = {
      substance: substance.trim(),
      doseMg: doseMg ? Number(doseMg) : undefined,
      takenAt: t,
      date: todayKey(cutoff),
      category,
      note: note.trim() || undefined,
    };
    await db.meds.add(entry);
    await db.substances.put({ name: entry.substance, category, lastUsed: t });
    setDoseMg('');
    setNote('');
  }

  async function removeEntry(id: number) {
    await db.meds.delete(id);
  }

  const insights = useMemo(() => substanceInsights(nights, meds), [nights, meds]);
  const stack = useMemo(() => bestStack(nights, meds), [nights, meds]);
  const bedtime = useMemo(() => optimalBedtime(nights), [nights]);
  const flags = useMemo(() => redFlags(nights, meds), [nights, meds]);

  return (
    <div className="flex flex-col gap-4">
      <Card title="Log a substance">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Substance">
            <Input
              list="substance-suggestions"
              value={substance}
              onChange={e => handleSubstanceChange(e.target.value)}
              placeholder="e.g. melatonin"
            />
            <datalist id="substance-suggestions">
              {substances.map((s: SubstanceMeta) => (
                <option key={s.name} value={s.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Dose (mg)">
            <Input
              inputMode="decimal"
              value={doseMg}
              onChange={e => setDoseMg(e.target.value)}
              placeholder="optional"
            />
          </Field>
          <Field label="Taken at">
            <Input
              type="datetime-local"
              value={takenAt}
              onChange={e => setTakenAt(e.target.value)}
            />
          </Field>
          <Field label="Category">
            <Select value={category} onChange={e => setCategory(e.target.value as MedEntry['category'])}>
              <option value="stimulant">stimulant</option>
              <option value="sleep aid">sleep aid</option>
              <option value="antidepressant">antidepressant</option>
              <option value="other">other</option>
            </Select>
          </Field>
          <Field label="Note">
            <Input value={note} onChange={e => setNote(e.target.value)} placeholder="optional" />
          </Field>
        </div>
        <div className="mt-3">
          <Button onClick={addEntry} disabled={!substance.trim()}>
            Add entry
          </Button>
        </div>
      </Card>

      <Card title={`Recent entries (${meds.length})`}>
        {meds.length === 0 ? (
          <div className="text-mute text-sm">Nothing logged yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead className="text-mute">
                <tr>
                  <th className="text-left font-normal py-1">When</th>
                  <th className="text-left font-normal py-1">Substance</th>
                  <th className="text-left font-normal py-1">Dose</th>
                  <th className="text-left font-normal py-1">Cat.</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {meds.slice(0, 50).map(m => (
                  <tr key={m.id} className="border-t border-edge">
                    <td className="py-1.5">
                      {new Date(m.takenAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td>{m.substance}</td>
                    <td>{m.doseMg != null ? `${m.doseMg}mg` : '—'}</td>
                    <td className="text-mute">{m.category}</td>
                    <td className="text-right">
                      <button
                        onClick={() => m.id && removeEntry(m.id)}
                        className="text-bad/80 hover:text-bad text-xs"
                      >
                        delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Patterns & suggestions">
        {nights.length < 14 ? (
          <div className="text-mute text-sm">
            Need ≥14 nights of paired sleep+med data. You have {nights.length}.
          </div>
        ) : (
          <div className="flex flex-col gap-4 text-sm">
            {insights.length === 0 && (
              <div className="text-mute">No substance has ≥7 nights yet.</div>
            )}
            {insights.map(i => {
              const dTst = i.meanTstWith - i.meanTstWithout;
              const dAwk = i.awakeningsWith - i.awakeningsWithout;
              return (
                <div key={i.substance} className="border-l-2 border-accent/40 pl-3">
                  <div className="font-medium">
                    {i.substance} <span className="text-mute text-xs">· {i.category}</span>
                  </div>
                  <div>
                    On nights you took it: TST {fmtMin(dTst)} vs nights without · awakenings{' '}
                    {dAwk >= 0 ? '+' : ''}
                    {dAwk.toFixed(1)} · efficiency{' '}
                    {((i.efficiencyWith - i.efficiencyWithout) * 100).toFixed(1)}%
                  </div>
                  <div className="text-mute text-xs">{i.note}</div>
                </div>
              );
            })}

            {bedtime && (
              <div className="border-l-2 border-good/40 pl-3">
                <div className="font-medium">Best bedtime so far: {bedtime.bedtimeHHMM}</div>
                <div>Mean efficiency {(bedtime.meanEfficiency * 100).toFixed(1)}%</div>
                <div className="text-mute text-xs">{bedtime.note}</div>
              </div>
            )}

            {stack && (
              <div className="border-l-2 border-warn/40 pl-3">
                <div className="font-medium">
                  Suggested stack: {stack.combination.join(' + ') || '(nothing)'}
                </div>
                <div>
                  Mean TST {stack.meanTstHours.toFixed(2)}h · awakenings{' '}
                  {stack.meanAwakenings.toFixed(1)}
                </div>
                <div className="text-mute text-xs">{stack.note}</div>
              </div>
            )}

            {flags.length > 0 && (
              <div className="border-l-2 border-bad/40 pl-3">
                <div className="font-medium">Pattern flags</div>
                <ul className="list-disc list-inside">
                  {flags.map((f, i) => (
                    <li key={i}>
                      {f.message}{' '}
                      <span className="text-mute text-xs">— {f.evidence}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
