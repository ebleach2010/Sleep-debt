'use client';
/**
 * Simple SVG sparkline. Plots last N nights of TST vs a horizontal need line.
 * No external charting library — keep deps minimal per spec.
 */
export function Sparkline({
  values,
  need,
  labels,
  height = 80,
}: {
  values: number[];
  need: number;
  labels?: string[];
  height?: number;
}) {
  const width = 320;
  const pad = 6;
  const max = Math.max(need + 1, ...values, 9);
  const min = Math.min(need - 1, ...values, 4);
  const span = max - min || 1;
  const xStep = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;

  const points = values
    .map((v, i) => {
      const x = pad + i * xStep;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const needY = pad + (1 - (need - min) / span) * (height - pad * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto block">
      <line
        x1={pad}
        x2={width - pad}
        y1={needY}
        y2={needY}
        stroke="#8a8a95"
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      <polyline
        fill="none"
        stroke="#7c9cff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
      {values.map((v, i) => {
        const x = pad + i * xStep;
        const y = pad + (1 - (v - min) / span) * (height - pad * 2);
        const below = v < need;
        return (
          <circle key={i} cx={x} cy={y} r={2.5} fill={below ? '#ff6b6b' : '#7ee787'}>
            {labels?.[i] && <title>{`${labels[i]}: ${v.toFixed(1)}h`}</title>}
          </circle>
        );
      })}
    </svg>
  );
}
