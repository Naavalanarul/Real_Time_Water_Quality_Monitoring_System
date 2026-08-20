/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['"Instrument Serif"', "Georgia", "serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.7" },
          "50%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(0.9)", opacity: "0.7" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.6s ease-out forwards",
        "slide-up": "slide-up 0.7s ease-out forwards",
        "slide-up-delay-1": "slide-up 0.7s 0.1s ease-out forwards",
        "slide-up-delay-2": "slide-up 0.7s 0.2s ease-out forwards",
        "slide-up-delay-3": "slide-up 0.7s 0.3s ease-out forwards",
        "slide-up-delay-4": "slide-up 0.7s 0.4s ease-out forwards",
        "slide-up-delay-5": "slide-up 0.7s 0.5s ease-out forwards",
        "pulse-ring": "pulse-ring 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
