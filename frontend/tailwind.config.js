/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: '#0a0d15',
        panel: '#10131d',
        middle: '#0d1018',
        tabbar: '#080b12',
        tabactive: '#151927',
        surface: '#171b29',
        divider: '#262b3f',
        primary: '#e9ecf5',
        muted: '#8a90ad',
        accent: '#5b8cff',
        accent2: '#8b5cf6',
        gmail: '#EA4335',
        yahoo: '#6001D2',
        outlook: '#0078D4',
        imap: '#64748b',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(135deg, #5b8cff 0%, #8b5cf6 100%)',
      },
      boxShadow: {
        card: 'inset 0 1px 0 0 rgba(255,255,255,0.04), 0 8px 24px -12px rgba(0,0,0,0.6)',
        glow: '0 0 24px rgba(91,140,255,0.25)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        caption: '11px',
        body: '13px',
        subhead: '15px',
        head: '18px',
      },
    },
  },
  plugins: [],
}
