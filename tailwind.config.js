/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#1a1a1a',
        border: '#2a2a2a',
        accent: '#6366f1',
        success: '#22c55e',
        error: '#ef4444',
        warning: '#eab308',
        'text-primary': '#ffffff',
        'text-secondary': '#9ca3af',
      },
    },
  },
  plugins: [],
};
