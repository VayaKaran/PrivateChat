/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        chat: {
          bg: '#0A0F1D',
          panel: '#111827',
          surface: '#1F2937',
          border: '#374151',
          primary: '#06B6D4',
          primaryHover: '#0891B2',
          accent: '#14B8A6',
          bubbleOut: '#0E7490',
          bubbleIn: '#1E293B',
          textMuted: '#9CA3AF',
        },
      },
    },
  },
  plugins: [],
};
