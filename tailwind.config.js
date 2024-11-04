/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "rgb(229 231 235)",
        input: "rgb(229 231 235)",
        ring: "rgb(59 130 246)",
        background: "white",
        foreground: "rgb(17 24 39)",
        primary: {
          DEFAULT: "rgb(59 130 246)",
          foreground: "white",
        },
        secondary: {
          DEFAULT: "rgb(249 250 251)",
          foreground: "rgb(17 24 39)",
        },
        destructive: {
          DEFAULT: "rgb(239 68 68)",
          foreground: "white",
        },
        muted: {
          DEFAULT: "rgb(249 250 251)",
          foreground: "rgb(107 114 128)",
        },
        accent: {
          DEFAULT: "rgb(249 250 251)",
          foreground: "rgb(17 24 39)",
        },
        popover: {
          DEFAULT: "white",
          foreground: "rgb(17 24 39)",
        },
        card: {
          DEFAULT: "white",
          foreground: "rgb(17 24 39)",
        },
      },
      borderRadius: {
        lg: "0.5rem",
        md: "calc(0.5rem - 2px)",
        sm: "calc(0.5rem - 4px)",
      }
    },
  },
  plugins: [],
}
