/* Optional advanced loader. Disabled by default so NexPlay keeps the legacy runtime as the source of truth. */
const isNexPlayDesktopRuntime = Boolean(window.NexPlayDesktop?.isDesktopApp);

window.NEXPLAY_FLAGS = {
    ...(window.NEXPLAY_FLAGS || {}),
    use_command_palette: false,
    ...(isNexPlayDesktopRuntime ? { use_pwa: false } : {})
};

(function initNexplayNextOptionalBoot() {
    if (!window.NEXPLAY_FLAGS?.enable_next_bootstrap) return;
    const isHttp = location.protocol === 'http:' || location.protocol === 'https:';
    if (isHttp && !document.querySelector('link[rel="manifest"]')) {
        const manifest = document.createElement('link');
        manifest.rel = 'manifest';
        manifest.href = './manifest.webmanifest';
        document.head.appendChild(manifest);
    }

    async function shouldLoadScript(path) {
        try {
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) return false;
            const contentType = String(response.headers.get('content-type') || '').toLowerCase();
            const bodyHead = (await response.text()).trimStart().slice(0, 64).toLowerCase();
            if (contentType.includes('text/html')) return false;
            if (bodyHead.startsWith('<!doctype') || bodyHead.startsWith('<html')) return false;
            return true;
        } catch (_) {
            return false;
        }
    }

    async function loadBootstrap() {
        const basePath = './nexplay-next/';
        if (location.protocol === 'file:') {
            const fileScript = document.createElement('script');
            fileScript.src = basePath + 'bootstrap.file.js';
            fileScript.defer = true;
            fileScript.dataset.nexplayOptionalBootstrap = 'true';
            document.body.appendChild(fileScript);
            return;
        }

        const modulePath = basePath + 'bootstrap.js';
        if (!(await shouldLoadScript(modulePath))) return;
        const script = document.createElement('script');
        script.type = 'module';
        script.src = modulePath;
        script.dataset.nexplayOptionalBootstrap = 'true';
        script.onerror = () => {
            console.warn('[NexPlayNext] Optional bootstrap failed to load.');
        };
        document.body.appendChild(script);
    }

    loadBootstrap();
})();
