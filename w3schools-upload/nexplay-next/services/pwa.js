export async function registerPwaShell(options = {}) {
    if (typeof window === 'undefined') return { supported: false, registered: false };
    if (!('serviceWorker' in navigator)) return { supported: false, registered: false };
    if (!(location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
        return { supported: false, registered: false, reason: 'insecure_context' };
    }

    try {
        const scope = options.scope || './';
        const script = options.script || './sw.js';
        const registration = await navigator.serviceWorker.register(script, { scope });
        return {
            supported: true,
            registered: true,
            scope: registration.scope
        };
    } catch (error) {
        return {
            supported: true,
            registered: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
