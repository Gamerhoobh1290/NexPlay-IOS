export function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
        return;
    }
    console[type === 'error' ? 'error' : 'log']('[NexPlay]', message);
}

export function init() {
    window.NexPlayToast = { showToast };
    return window.NexPlayToast;
}
