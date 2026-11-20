/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/screens/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#16264F",
        mut: "#5E6F96",
        brand: "#2F66F0",
        line: "#DCE6FA",
        ok: "#12906A",
        okbg: "#DCF6EA",
        wait: "#A85F00",
        waitbg: "#FFE7C7",
        bad: "#E5484D",
        badbg: "#FFE4E6",
        duck: "#FFCF40",
      },
      fontFamily: {
        sans: ["BeVietnamPro_400Regular"],
        medium: ["BeVietnamPro_500Medium"],
        semibold: ["BeVietnamPro_600SemiBold"],
        bold: ["BeVietnamPro_700Bold"],
        display: ["Baloo2_600SemiBold"],
        displaybold: ["Baloo2_700Bold"],
      },
    },
  },
  plugins: [],
};
