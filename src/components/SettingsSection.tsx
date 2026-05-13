'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, exportAll, getSettings, updateSettings } from '@/lib/db';
import { Button, Card, Field, Input } from './ui';
import { useState } from 'react';
import * as Sci from '@/lib/sleep-science';

export function SettingsSection() {
  const settings = useLiveQuery(() => getSettings(), []);
  const [showEqns, setShowEqns] = useState(false);

  if (!settings) return null;

  async function downloadBackup() {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sleep-debt-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function wipeAll() {
    if (!confirm('Erase all local data? This cannot be undone.')) return;
    await db.transaction('rw', db.nights, db.meds, db.substances, db.settings, async () => {
      await Promise.all([db.nights.clear(), db.meds.clear(), db.substances.clear(), db.settings.clear()]);
    });
    location.reload();
  }

  return (
    <Card title="Settings">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sleep need (hours)">
          <Input
            type="number"
            step="0.1"
            min="4"
            max="12"
            value={settings.sleepNeedH}
            onChange={e => updateSettings({ sleepNeedH: Number(e.target.value) })}
          />
        </Field>
        <Field label="Bodyweight (lb)">
          <Input
            type="number"
            step="1"
            min="80"
            max="400"
            value={settings.bodyweightLb}
            onChange={e => updateSettings({ bodyweightLb: Number(e.target.value) })}
          />
        </Field>
        <Field label="Sleep-day cutoff (hour, 24h)">
          <Input
            type="number"
            min="12"
            max="23"
            value={settings.cutoffHour}
            onChange={e => updateSettings({ cutoffHour: Number(e.target.value) })}
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={downloadBackup}>
          Export JSON backup
        </Button>
        <Button variant="ghost" onClick={() => setShowEqns(v => !v)}>
          {showEqns ? 'Hide' : 'Show'} raw equations
        </Button>
        <Button variant="danger" onClick={wipeAll}>
          Wipe local data
        </Button>
      </div>
      {showEqns && (
        <pre className="mt-3 text-xs text-mute bg-panel2 border border-edge rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
{`Sleep need (default): ${Sci.DEFAULT_SLEEP_NEED_H} h
Recovery coefficient: ${Sci.RECOVERY_COEFFICIENT}   (1h extra → ${(Sci.RECOVERY_COEFFICIENT * 60).toFixed(0)}min debt repaid)
Max nightly recovery: ${Sci.MAX_NIGHTLY_RECOVERY_H} h
Debt decay window: ${Sci.DEBT_DECAY_START_DAYS}–${Sci.DEBT_DECAY_END_DAYS} d (start mult ${Sci.DEBT_DECAY_FACTOR_AT_START} → 0)
Dawson & Reid anchors: ${Sci.DR_HOURS_AWAKE_LOW}h ≈ ${Sci.DR_BAC_AT_LOW}% BAC; ${Sci.DR_HOURS_AWAKE_HIGH}h ≈ ${Sci.DR_BAC_AT_HIGH}% BAC
Debt → effective wake ratio: ${Sci.DEBT_TO_EFFECTIVE_WAKE_RATIO} (each 2h debt ≈ +1h awake)
Beer model: ${Sci.REFERENCE_BAC_PER_BEER_AT_REF_WEIGHT}% BAC per beer at ${Sci.DEFAULT_BODYWEIGHT_LB}lb`}
        </pre>
      )}
    </Card>
  );
}
