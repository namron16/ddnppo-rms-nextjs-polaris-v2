import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          dark:  '#0f1c35',
          DEFAULT: '#1a2a4a',
          mid:   '#1e3460',
        },
        blue: {
          brand:  '#2b4a8c',
          bright: '#3b63b8',
        },
        gold: {
          DEFAULT: '#f0b429',
          light:   '#fcd34d',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'sans-serif'],
        display: ['"DM Serif Display"', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
