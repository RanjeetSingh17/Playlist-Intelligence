import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#12181F",
          900: "#1B2430",
          800: "#232E3D",
          700: "#31404F",
          600: "#4A5A6C",
        },
        mist: {
          50: "#EDF1F5",
          200: "#C7D0DA",
          400: "#8FA0B3",
        },
        signal: {
          DEFAULT: "#7DD3C0",
          dim: "#4E9B8B",
        },
        amber: {
          DEFAULT: "#F2A65A",
          dim: "#C97F3A",
        },
      },
      fontFamily: {
        display: ["var(--font-plex-sans)", "sans-serif"],
        body: ["var(--font-plex-sans)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
