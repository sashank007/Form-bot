/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx,html}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          purple: '#8B4513',      // SaddleBrown - main beaver brown (mapped from purple)
          blue: '#D2691E',         // Chocolate - warm orange-brown (mapped from blue)
          brown: '#8B4513',       // SaddleBrown - main beaver brown
          orange: '#D2691E',      // Chocolate - warm orange-brown
          tan: '#CD853F',         // Peru - lighter tan
          dark: '#654321',        // DarkBrown - deep brown
        },
        beaver: {
          50: '#F5E6D3',          // Light cream
          100: '#E8D5B7',         // Light tan
          200: '#D4B896',         // Tan
          300: '#C19A6B',         // Medium tan
          400: '#A0522D',         // Sienna
          500: '#8B4513',         // SaddleBrown
          600: '#6B3410',         // Dark brown
          700: '#5D2E0A',         // Deeper brown
          800: '#4A2408',         // Very dark brown
          900: '#3D1E06',         // Almost black brown
        },
        purple: {
          50: '#F5E6D3',          // Light cream (beaver-themed)
          100: '#E8D5B7',         // Light tan
          200: '#D4B896',        // Tan
          300: '#C19A6B',        // Medium tan
          400: '#A0522D',        // Sienna
          500: '#8B4513',        // SaddleBrown
          600: '#6B3410',        // Dark brown
          700: '#5D2E0A',        // Deeper brown
          800: '#4A2408',        // Very dark brown
          900: '#3D1E06',        // Almost black brown
        },
        blue: {
          50: '#F5E6D3',          // Light cream (beaver-themed)
          100: '#E8D5B7',        // Light tan
          200: '#D4B896',       // Tan
          300: '#C19A6B',       // Medium tan
          400: '#A0522D',       // Sienna
          500: '#D2691E',       // Chocolate (warm orange-brown)
          600: '#CD853F',       // Peru (lighter tan)
          700: '#8B4513',       // SaddleBrown
          800: '#6B3410',       // Dark brown
          900: '#5D2E0A',       // Deeper brown
        },
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #8B4513 0%, #D2691E 100%)',
        'gradient-beaver': 'linear-gradient(135deg, #8B4513 0%, #CD853F 50%, #D2691E 100%)',
      },
      backdropBlur: {
        'glass': '12px',
      },
      borderRadius: {
        'card': '12px',
      },
      transitionDuration: {
        'smooth': '200ms',
      },
    },
  },
  plugins: [],
}

