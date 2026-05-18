import type { Config } from 'tailwindcss';

// Tailwind CSS v4 — theme tokens are defined in src/index.css via @theme.
// This config only specifies content paths for class detection.
const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  plugins: [],
};

export default config;