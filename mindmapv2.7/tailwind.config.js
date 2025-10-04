/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./{App,constants,types,firebase,index}.tsx",
    "./{components,contexts,hooks,services}/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}
