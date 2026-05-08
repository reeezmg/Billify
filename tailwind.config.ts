import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eefaf5',
          100: '#d7f3e7',
          200: '#b1e7cf',
          300: '#7ed4ad',
          400: '#45b881',
          500: '#1f8d5c',
          600: '#166b46',
          700: '#114f36',
          800: '#0e3e2b',
          900: '#0b3122',
        },
      },
      boxShadow: {
        glow: '0 20px 60px rgba(31, 141, 92, 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;
