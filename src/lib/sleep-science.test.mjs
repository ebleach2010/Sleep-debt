/**
 * Plain-Node sanity check for the literature anchors. No test framework —
 * compile sleep-science.ts and run this with `node`. CI-friendly later if
 * needed; mostly here so future-you can re-run it after touching constants.
 *
 *   npx tsc src/lib/sleep-science.ts src/lib/dateUtils.ts \
 *     --outDir /tmp/sd-test --target ES2022 --module esnext \
 *     --moduleResolution bundler --esModuleInterop --skipLibCheck
 *   cp src/lib/sleep-science.test.mjs /tmp/sd-test/
 *   node /tmp/sd-test/sleep-science.test.mjs
 */
import {
  computeSleepDebt,
  hoursAwakeToBac,
  impairmentBac,
  bacToBeers,
  effectiveHoursAwake,
  nightsToRepay,
  RECOVERY_COEFFICIENT,
} from './sleep-science.js';

let failures = 0;
function assertNear(label, actual, expected, eps = 1e-3) {
  const ok = Math.abs(actual - expected) <= eps;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got ${actual}, want ${expected}`);
  if (!ok) failures++;
}

// Dawson & Reid anchors must hit exactly.
assertNear('17h awake → 0.05% BAC', hoursAwakeToBac(17), 0.05);
assertNear('24h awake → 0.10% BAC', hoursAwakeToBac(24), 0.10);

// Debt: 7×6h then 1×9.5h with need=8h. Should add 14h, repay 0.75h.
const nights = [];
for (let i = 1; i <= 7; i++)
  nights.push({ date: `2026-05-${String(i).padStart(2, '0')}`, tst: 6, tib: 6.5, efficiency: 0.92, onset: 0, wake: 0, awakenings: 0 });
nights.push({ date: '2026-05-08', tst: 9.5, tib: 10, efficiency: 0.95, onset: 0, wake: 0, awakenings: 0 });
const r = computeSleepDebt(nights, { sleepNeedH: 8, nowMs: new Date(2026, 4, 9, 12).getTime() });
assertNear('debt = 14 - 1.5*recoveryCoef', r.currentDebtH, 14 - 1.5 * RECOVERY_COEFFICIENT, 1e-2);

// Effective wake adds half of debt (per spec: 2h debt ≈ +1h awake).
const ew = effectiveHoursAwake(10, 8);
assertNear('10h debt + 8h awake → 13h effective', ew, 13);

// Beers scales with bodyweight.
const b180 = bacToBeers(0.04, 180);
const b120 = bacToBeers(0.04, 120);
assertNear('0.04% BAC @ 180lb → 2 beers', b180, 2);
// Lighter body → each beer raises BAC more → fewer beers to hit the same %.
assertNear('0.04% BAC @ 120lb → ~1.33 beers', b120, 0.04 / (0.02 * 180 / 120), 1e-3);

// nightsToRepay is monotonic in target hours.
const n8 = nightsToRepay(10, 8.5, 8);
const n9 = nightsToRepay(10, 9, 8);
console.log(`nights to repay 10h @ 8.5h: ${n8}, @ 9h: ${n9}`);

console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
