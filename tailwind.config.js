/** @type {import('tailwindcss').Config} */
export default {
  // Light-UI erzwingen: Dark-Styles werden nicht genutzt.
  // Damit Tailwind nicht automatisch nach OS-Einstellung umschaltet,
  // nutzen wir "class" (ohne dass wir irgendwo die Klasse "dark" setzen).
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
