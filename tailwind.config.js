/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./index.html', './*.js'],
    theme: {
      extend: {
        colors: {
          primary: {
            DEFAULT: '#22c55e',
            dark: '#16a34a',
            light: '#4ade80'
          }
        }
      }
    },
    plugins: []
  };