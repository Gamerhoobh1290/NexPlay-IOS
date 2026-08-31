(function () {
    if (!(location.protocol === 'http:' || location.protocol === 'https:')) return;
    if (document.querySelector('link[rel="manifest"]')) return;

    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = './manifest.webmanifest';
    document.head.appendChild(manifest);
})();
