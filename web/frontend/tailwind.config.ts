import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#094cb2",
          50: "#eff6ff",
          100: "#dbeafe",
          500: "#094cb2",
          600: "#073d8f",
          700: "#062d6b",
        },
        surface: {
          lowest: "#ffffff",
          DEFAULT: "#faf9fa",
          low: "#f3f2f4",
        },
        mgi: {
          0: "#9ca3af",  // gray — healthy
          1: "#22c55e",  // green
          2: "#eab308",  // yellow
          3: "#f97316",  // orange
          4: "#ef4444",  // red
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        serif: ["Noto Serif", "serif"],
      },
      borderRadius: {
        DEFAULT: "2px",
        lg: "4px",
        xl: "8px",
        "2xl": "12px",
      },
    },
  },
  plugins: [],
};

export default config;
