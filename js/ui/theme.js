import { setState } from '../core/state.js';

export function applyThemePreference(isDarkMode = true) {
    document.documentElement.classList.toggle('dark', !!isDarkMode);
    document.body?.classList.toggle('theme-light', !isDarkMode);
    document.body?.classList.toggle('theme-dark', !!isDarkMode);
    setState({ isDarkMode: !!isDarkMode }, 'theme:apply');
}

export function init() {
    window.NexPlayTheme = { applyThemePreference };
    return window.NexPlayTheme;
}
