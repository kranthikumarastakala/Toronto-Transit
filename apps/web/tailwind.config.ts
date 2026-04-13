import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#122126",
        paper: "#f4efe6",
        pine: "#0d4d45",
        rust: "#d96c3d",
        sand: "#dcc8b4",
        mist: "#edf4ef"
      },
      boxShadow: {
        float: "0 22px 60px rgba(18, 33, 38, 0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;

