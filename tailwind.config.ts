import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0b',
        panel: '#15151a',
        panel2: '#1d1d24',
        edge: '#2a2a33',
        ink: '#e8e8ec',
        mute: '#8a8a95',
        accent: '#7c9cff',
        warn: '#ffb86b',
        bad: '#ff6b6b',
        good: '#7ee787',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
