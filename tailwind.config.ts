import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'media', // Respects system preference
  theme: {
    extend: {
      colors: {
        gray: { 50: '#f4f5f2', 100: '#eef2ef', 200: '#dce2dd', 300: '#c7d0ca', 400: '#aab8b1', 500: '#657269', 600: '#58665f', 700: '#364047', 800: '#20272b', 900: '#14191d', 950: '#0d1215' },
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
