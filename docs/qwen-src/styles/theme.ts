// RonecaPlayTV - Theme Configuration
// Dark Neon Theme with Orange and Cyan

export const theme = {
  colors: {
    // Background colors
    background: {
      primary: '#050B0F',
      secondary: '#07131A',
      card: '#111C24',
      cardHover: '#1A2A35',
    },
    // Border colors
    border: {
      default: '#253541',
      focused: '#FF7A1A',
      active: '#31D67B',
    },
    // Neon colors
    neon: {
      orange: '#FF7A1A',
      cyan: '#00E6E6',
      green: '#31D67B',
      yellow: '#FFD447',
      red: '#FF4D4D',
    },
    // Text colors
    text: {
      primary: '#FFFFFF',
      secondary: '#B8C2CC',
      muted: '#6B7C8C',
    },
    // Gradient backgrounds
    gradients: {
      primary: 'linear-gradient(135deg, #FF7A1A 0%, #00E6E6 100%)',
      card: 'linear-gradient(180deg, #111C24 0%, #0A1218 100%)',
      focus: 'linear-gradient(135deg, rgba(255, 122, 26, 0.2) 0%, rgba(0, 230, 230, 0.1) 100%)',
    },
    // Shadows
    shadows: {
      glow: '0 0 20px rgba(255, 122, 26, 0.3)',
      glowCyan: '0 0 20px rgba(0, 230, 230, 0.3)',
      card: '0 4px 20px rgba(0, 0, 0, 0.4)',
    },
  },
  spacing: {
    // TV spacing (larger for remote navigation)
    tv: {
      cardGap: '24px',
      sectionGap: '40px',
      padding: '32px',
      cardWidth: '280px',
      cardHeight: '160px',
      fontSize: {
        xs: '14px',
        sm: '16px',
        base: '18px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
      },
    },
    // Mobile spacing
    mobile: {
      cardGap: '12px',
      sectionGap: '24px',
      padding: '16px',
      cardWidth: '100%',
      cardHeight: '120px',
      fontSize: {
        xs: '12px',
        sm: '14px',
        base: '16px',
        lg: '20px',
        xl: '28px',
        '2xl': '36px',
      },
    },
  },
  borderRadius: {
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    full: '9999px',
  },
  transitions: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '400ms ease',
  },
  breakpoints: {
    mobile: '640px',
    tablet: '768px',
    tv: '1024px',
  },
};

export type Theme = typeof theme;
