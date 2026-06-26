/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0F172A',
          mid: '#1E293B',
          light: '#334155',
        },
        mint: '#6EE7B7',
        emerald: {
          DEFAULT: '#059669',
          light: '#D1FAE5',
          dark: '#065F46',
        },
        slate: {
          DEFAULT: '#94A3B8',
          light: '#CBD5E1',
        },
        cream: '#F8FAFC',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Syne', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
