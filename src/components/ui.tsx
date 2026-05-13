'use client';
import { type ReactNode } from 'react';

export function Card({
  title,
  children,
  accent,
}: {
  title?: string;
  children: ReactNode;
  accent?: 'good' | 'warn' | 'bad' | 'accent';
}) {
  const colorMap = {
    good: 'border-good/40',
    warn: 'border-warn/40',
    bad: 'border-bad/40',
    accent: 'border-accent/40',
  } as const;
  return (
    <div
      className={`rounded-2xl border ${accent ? colorMap[accent] : 'border-edge'} bg-panel p-4`}
    >
      {title && <div className="text-mute text-xs uppercase tracking-wider mb-2">{title}</div>}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: 'good' | 'warn' | 'bad' | 'accent';
}) {
  const colorMap = {
    good: 'text-good',
    warn: 'text-warn',
    bad: 'text-bad',
    accent: 'text-accent',
  } as const;
  return (
    <div className="rounded-2xl border border-edge bg-panel p-4 flex flex-col gap-1">
      <div className="text-mute text-xs uppercase tracking-wider">{label}</div>
      <div className={`text-3xl font-semibold tnum ${accent ? colorMap[accent] : ''}`}>{value}</div>
      {sub && <div className="text-mute text-xs">{sub}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger';
  className?: string;
  type?: 'button' | 'submit';
}) {
  const variants = {
    primary: 'bg-accent text-bg hover:opacity-90',
    ghost: 'bg-panel2 text-ink border border-edge hover:bg-edge',
    danger: 'bg-bad/20 text-bad border border-bad/40 hover:bg-bad/30',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-mute text-xs uppercase tracking-wider">{label}</span>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`bg-panel2 border border-edge rounded-lg px-3 py-2 text-ink outline-none focus:border-accent ${props.className ?? ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`bg-panel2 border border-edge rounded-lg px-3 py-2 text-ink outline-none focus:border-accent ${props.className ?? ''}`}
    />
  );
}
