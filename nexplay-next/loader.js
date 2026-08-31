(function () {
    const basePath = './nexplay-next/';
    const script = document.createElement('script');

    if (window.location.protocol === 'file:') {
        script.src = basePath + 'bootstrap.file.js';
        script.defer = true;
    } else {
        script.type = 'module';
        script.src = basePath + 'bootstrap.js';
    }

    script.onerror = function () {
        console.error('[NexPlayNext] Failed to load bootstrap script:', script.src);
    };

    document.body.appendChild(script);
})();
