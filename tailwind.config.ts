import type { Config } from "tailwindcss";

// Palette matches azaelmontejo.com: near-black background, white text, red accent.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0a0a0a",
        panel: "#141414",
        line: "#262626",
        muted: "#a3a3a3",
        accent: { DEFAULT: "#cc0000", hover: "#e60000" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
