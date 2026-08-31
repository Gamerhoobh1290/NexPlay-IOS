let installed = false;
const reported = new WeakSet();

function report(error, source = 'runtime') {
    const normalized = error instanceof Error ? error : new Error(String(error || 'Unknown error'));
    if (reported.has(normalized)) return;
    reported.add(normalized);
    console.error('[NexPlay]', source, normalized);
    try {
        if (typeof window.showToast === 'function') {
            window.showToast(normalized.message || 'NexPlay encountered an error.', 'error');
        }
    } catch (_) {}
}

export function captureModuleError(moduleName, error) {
    report(error, moduleName || 'module');
}

export function init() {
    if (installed) return { captureModuleError };
    installed = true;
    window.addEventListener('error', (event) => report(event.error || event.message, 'window:error'));
    window.addEventListener('unhandledrejection', (event) => report(event.reason, 'promise:unhandledrejection'));
    window.addEventListener('nexplay:module-error', (event) => {
        const detail = event.detail || {};
        report(detail.error || 'Module error', detail.module || 'module');
    });
    window.NexPlayErrorBoundary = { captureModuleError };
    return window.NexPlayErrorBoundary;
}
