/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Backgrounds
        'surface-0': '#0f0f0f', // Deepest background
        'surface-1': '#1a1a1a', // Primary background
        'surface-2': '#242424', // Elevated surfaces
        'surface-3': '#2e2e2e', // Hover states

        // Text
        'text-primary': '#e5e5e5',
        'text-secondary': '#a3a3a3',
        'text-muted': '#737373',

        // Accents (semantic only)
        'accent-primary': '#60a5fa', // Selection, focus

        // Status
        'status-healthy': '#4ade80',
        'status-warning': '#facc15',
        'status-error': '#f87171',

        // Connections
        'connection-normal': '#525252',
        'connection-highlighted': '#60a5fa',
        'connection-circular': '#facc15',
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
