// Design tokens matching temp.html (Beyond Workspace design)
export const DESIGN_TOKENS = {
  colors: {
    // Grayscale palette
    background: {
      page: '#e8e8e8',      // Body background
      main: '#f2f2f2',      // Main content area
      card: '#ffffff',      // Cards/panels
      sidebar: '#ffffff',   // Sidebar
    },
    text: {
      primary: '#1a1a1a',   // Main text
      secondary: '#555555', // Secondary text
      muted: '#aaaaaa',     // Muted text (labels, placeholders)
      disabled: '#bbbbbb',  // Disabled state
    },
    border: {
      light: '#e8e8e8',     // Light borders
      default: '#dddddd',   // Default borders
      medium: '#f0f0f0',    // Medium borders
    },
    interactive: {
      hover: '#f5f5f5',     // Hover backgrounds
      active: '#f0f0f0',    // Active state
      focus: '#fafafa',     // Focus state
    },
    accent: {
      green: '#4ade80',     // Success/positive
      orange: '#fb923c',    // Warning
      blue: '#60a5fa',      // Info
      red: '#ef4444',       // Error/destructive
      gray: '#cdd5e0',      // Neutral accent
    },
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    sizes: {
      xs: '10px',
      sm: '11px',
      base: '13px',
      md: '13.5px',
      lg: '14px',
      xl: '15px',
      '2xl': '16px',
      '3xl': '18px',
      '4xl': '22px',
      '5xl': '26px',
    },
    weights: {
      light: 300,
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
  spacing: {
    xs: '6px',
    sm: '8px',
    md: '10px',
    base: '12px',
    lg: '14px',
    xl: '16px',
    '2xl': '18px',
    '3xl': '20px',
    '4xl': '22px',
    '5xl': '24px',
    '6xl': '32px',
    '7xl': '36px',
  },
  radius: {
    sm: '6px',
    md: '8px',
    lg: '10px',
    xl: '14px',
    '2xl': '16px',
  },
  shadows: {
    subtle: '0 1px 3px rgba(0, 0, 0, 0.06)',
    card: '0 1px 3px rgba(0, 0, 0, 0.06)',
    dropdown: '0 4px 16px rgba(0, 0, 0, 0.1)',
  },
  layout: {
    sidebarWidth: '260px',
    sidebarMargin: '12px',
    mainMargin: '12px',
    mainPadding: '32px 36px',
  },
} as const;
