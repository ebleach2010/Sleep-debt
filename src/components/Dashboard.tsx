'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { db, getSettings } from '@/lib/db';
import {
  bacToBeers,
  computeSleepDebt,
  effectiveHoursAwake,
  impairmentBac,
  nightsToRepay,
  DEFAULT_SLEEP_NEED_H,
} from '@/lib/sleep-science';
import { ImportButton, RefreshButton } from '@/components/ImportButton';
import { Sparkline } from '@/components/Sparkline';
import { Card, Stat, Field, Input } from '@/components/ui';
import { MedsSection } from '@/components/MedsSection';
import { SettingsSection } from '@/components/SettingsSection';
import { hmm } from '@/lib/dateUtils';

export function Dashboard() {
  const settings = useLiveQuery(() => getSettings(), []);
  const nights = useLiveQuery(() => db.nights.orderBy('date').toArray(), []) ?? [];
  const [refreshKey, setRefreshKey] = useState(0);
  const [simHours, setSimHours] = useState<string>('9');

  const need = settings?.sleepNeedH ?? DEFAULT_SLEEP_NEED_H;
  const bodyweight = settings?.bodyweightLb ?? 180;

  const { currentDebtH } = useMemo(
    () => computeSleepDebt(nights, { sleepNeedH: need }),
    [nights, need, refreshKey]
  );

  const lastNight = nights[nights.length - 1];
  const hoursAwakeToday = useMemo(() => {
    if (!lastNight) return 0;
    return Math.max(0, (Date.now() - lastNight.wake) / 3_600_000);
  }, [lastNight, refreshKey]);

  const impair = useMemo(
    () => impairmentBac(currentDebtH, hoursAwakeToday),
    [currentDebtH, hoursAwakeToday]
  );
  const beers = bacToBeers(impair.bacPct, bodyweight);
  const effWake = effectiveHoursAwake(currentDebtH, hoursAwakeToday);

  const last14 = nights.slice(-14);
  const sparkValues = last14.map(n => n.tst);
  const sparkLabels = last14.map(n => n.date);

  const simDebt = useMemo(() => {
    const target = Number(simHours);
    if (!target || !Number.isFinite(target)) return null;
    const hypoNight = lastNight
      ? { ...lastNight, date: nextDayKey(lastNight.date), tst: target }
      : null;
    if (!hypoNight) return null;
    const { currentDebtH: newDebt } = computeSleepDebt([...nights, hypoNight], {
      sleepNeedH: need,
    });
    return newDebt;
  }, [nights, lastNight, simHours, need]);

  const nightsTo8 = nightsToRepay(currentDebtH, 8.5, need);
  const lastDelta = lastNight ? lastNight.tst - need : 0;

  const debtColor = currentDebtH < 2 ? 'good' : currentDebtH < 6 ? 'warn' : 'bad';
  const beersColor = beers < 1 ? 'good' : beers < 3 ? 'warn' : 'bad';

  return (
    <main className="max-w-2xl mx-auto px-4 pb-12 flex flex-col gap-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-semibold">Sleep Debt</h1>
          {settings?.lastImportAt && (
            <div className="text-xs text-mute">
              Last import: {new Date(settings.lastImportAt).toLocaleString()}
              {settings.lastExportName ? ` · ${settings.lastExportName}` : ''}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <RefreshButton onDone={() => setRefreshKey(k => k + 1)} />
        </div>
      </header>

      {nights.length === 0 ? (
        <Card title="Start by importing your Apple Health export">
          <div className="text-sm text-mute mb-3">
            On iPhone: <em>Health → profile picture → Export All Health Data</em>. AirDrop the
            resulting <code>export.zip</code> to this device (or to yourself), then drop it in
            below. Parsing happens locally — your data never leaves the browser.
          </div>
          <ImportButton onDone={() => setRefreshKey(k => k + 1)} />
        </Card>
      ) : (
        <>
          <Stat
            label="Current sleep debt"
            value={`${currentDebtH.toFixed(1)}h`}
            sub={
              currentDebtH > 0
                ? `~${nightsTo8} nights of 8.5h to clear`
                : 'No accumulated debt'
            }
            accent={debtColor}
          />

          <div className="grid grid-cols-3 gap-3">
            <Stat
              label="Beers of impairment"
              value={beers.toFixed(1)}
              sub={`BAC eq. ${(impair.bacPct * 100).toFixed(2)}%`}
              accent={beersColor}
            />
            <Stat
              label="Effective hours awake"
              value={`${effWake.toFixed(1)}h`}
              sub={`Actual ${hoursAwakeToday.toFixed(1)}h`}
              accent={effWake > 17 ? 'bad' : effWake > 14 ? 'warn' : 'good'}
            />
            <Stat
              label="Last night"
              value={lastNight ? `${lastNight.tst.toFixed(1)}h` : '—'}
              sub={
                lastNight
                  ? `${lastDelta >= 0 ? '+' : ''}${lastDelta.toFixed(1)}h vs need`
                  : 'No data'
              }
              accent={lastNight ? (lastDelta >= 0 ? 'good' : 'bad') : 'accent'}
            />
          </div>

          <Card title="Last 14 nights (TST vs need)">
            {sparkValues.length > 1 ? (
              <Sparkline values={sparkValues} need={need} labels={sparkLabels} />
            ) : (
              <div className="text-mute text-sm">Not enough nights yet.</div>
            )}
            <div className="flex justify-between text-xs text-mute mt-1 tnum">
              <span>{last14[0]?.date}</span>
              <span>need: {need.toFixed(1)}h</span>
              <span>{last14[last14.length - 1]?.date}</span>
            </div>
          </Card>

          <Card title="What if I sleep ___ tonight?">
            <div className="flex items-end gap-3">
              <Field label="Tonight (h)">
                <Input
                  inputMode="decimal"
                  value={simHours}
                  onChange={e => setSimHours(e.target.value)}
                  className="w-24"
                />
              </Field>
              <div className="text-sm">
                Projected debt:{' '}
                <span className="tnum font-medium">
                  {simDebt != null ? `${simDebt.toFixed(1)}h` : '—'}
                </span>
                {simDebt != null && (
                  <span className="text-mute">
                    {' '}
                    ({(simDebt - currentDebtH >= 0 ? '+' : '')}
                    {(simDebt - currentDebtH).toFixed(1)}h vs now)
                  </span>
                )}
              </div>
            </div>
          </Card>

          <NightTable nights={nights} need={need} />

          <MedsSection />

          <SettingsSection />

          <Card title="Re-import">
            <ImportButton onDone={() => setRefreshKey(k => k + 1)} label="Re-upload export to refresh today" />
          </Card>
        </>
      )}
    </main>
  );
}

function NightTable({
  nights,
  need,
}: {
  nights: Array<import('@/lib/sleep-science').NightSummary>;
  need: number;
}) {
  const recent = [...nights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  return (
    <Card title="Nightly log">
      <div className="overflow-x-auto">
        <table className="w-full text-sm tnum">
          <thead className="text-mute">
            <tr>
              <th className="text-left font-normal py-1">Date</th>
              <th className="text-right font-normal py-1">TST</th>
              <th className="text-right font-normal py-1">Eff.</th>
              <th className="text-right font-normal py-1">Δ vs need</th>
              <th className="text-right font-normal py-1">Wake</th>
            </tr>
          </thead>
          <tbody>
            {recent.map(n => {
              const delta = n.tst - need;
              return (
                <tr key={n.date} className="border-t border-edge">
                  <td className="py-1.5">{n.date}</td>
                  <td className="text-right">{n.tst.toFixed(2)}h</td>
                  <td className="text-right">{(n.efficiency * 100).toFixed(0)}%</td>
                  <td className={`text-right ${delta < 0 ? 'text-bad' : 'text-good'}`}>
                    {delta >= 0 ? '+' : ''}
                    {delta.toFixed(1)}h
                  </td>
                  <td className="text-right text-mute">{hmm(n.wake)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function nextDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
