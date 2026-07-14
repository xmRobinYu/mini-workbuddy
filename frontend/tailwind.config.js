/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 暖色调主题：主背景白、菜单浅灰、强调色暖橙/琥珀
        warm: {
          bg: '#FFFFFF',
          menu: '#F5F5F4',
          border: '#E7E5E4',
          orange: '#EA580C',
          amber: '#F59E0B',
          'amber-light': '#FEF3C7',
          'orange-light': '#FFEDD5',
          text: '#1C1917',
          'text-muted': '#78716C',
        },
      },
      borderRadius: {
        warm: '6px',
      },
      boxShadow: {
        warm: '0 1px 3px 0 rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
}
