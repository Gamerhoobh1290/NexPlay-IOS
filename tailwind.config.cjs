module.exports = {
    content: [
        './index.html',
        './NexPlay.html',
        './NexPlay.mobile.html',
        './components/**/*.html',
        './js/**/*.js'
    ],
    darkMode: 'class',
    theme: {
        fontFamily: {
            sans: ['Outfit', 'sans-serif'],
            mono: ['Space Mono', 'monospace']
        },
        extend: {
            animation: {
                float: 'float 10s ease-in-out infinite',
                mesh: 'mesh 24s ease-in-out infinite alternate',
                'pop-in': 'popIn 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
                'slide-down': 'slideDown 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                laser: 'laser 2s linear infinite'
            },
            keyframes: {
                float: {
                    '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
                    '50%': { transform: 'translateY(-20px) rotate(2deg)' }
                },
                mesh: {
                    '0%': { backgroundPosition: '0% 50%' },
                    '100%': { backgroundPosition: '100% 50%' }
                },
                popIn: {
                    '0%': { opacity: '0', transform: 'scale(0.9) translateY(24px)' },
                    '55%': { opacity: '1', transform: 'scale(1.03) translateY(-3px)' },
                    '100%': { opacity: '1', transform: 'scale(1) translateY(0)' }
                },
                slideDown: {
                    '0%': { opacity: '0', transform: 'translateY(-14px)' },
                    '60%': { opacity: '0.9', transform: 'translateY(2px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' }
                },
                laser: {
                    '0%': { left: '-100%' },
                    '50%': { left: '100%' },
                    '100%': { left: '100%' }
                }
            }
        }
    }
};
