/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Matched to the reference sign-in page after correcting the photo's colour cast.
        brand: { DEFAULT: '#0051AD', dark: '#003F88' },
      },
    },
  },
  plugins: [],
}
