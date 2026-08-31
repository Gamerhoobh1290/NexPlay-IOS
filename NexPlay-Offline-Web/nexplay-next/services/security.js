/**
 * Basic HTML sanitizer for NexPlay overlays and plugin-provided UI content.
 * It removes inline event handlers, script/style/link/meta tags, and javascript: URLs.
 * @param {string} html
 */
export function sanitizeHtmlFragment(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');

    const blockedTags = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'IFRAME', 'OBJECT', 'EMBED']);
    const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);

    /** @type {Element[]} */
    /** @type {any[]} */
    const toRemove = [];

    while (walker.nextNode()) {
        const el = /** @type {Element} */ (walker.currentNode);
        if (blockedTags.has(el.tagName)) {
            toRemove.push(el);
            continue;
        }

        for (const attr of Array.from(el.attributes)) {
            const name = attr.name.toLowerCase();
            const value = String(attr.value || '').trim();

            if (name.startsWith('on')) {
                el.removeAttribute(attr.name);
                continue;
            }

            if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^javascript:/i.test(value)) {
                el.removeAttribute(attr.name);
                continue;
            }
        }
    }

    toRemove.forEach((/** @type {any} */ node) => node.remove());
    return template.innerHTML;
}

/**
 * Removes inline handlers from elements inside selected roots.
 * @param {string[]} selectors
 */
export function installScopedInlineHandlerGuard(selectors) {
    if (!Array.isArray(selectors) || selectors.length === 0) return;

    const isWithinScope = (/** @type {any} */ node) => {
        if (!(node instanceof Element)) return false;
        return selectors.some((/** @type {any} */ selector) => node.closest(selector));
    };

    const scrubElement = (/** @type {any} */ element) => {
        if (!(element instanceof Element)) return;
        if (!isWithinScope(element)) return;

        for (const attr of Array.from(element.attributes)) {
            if (attr.name.toLowerCase().startsWith('on')) {
                element.removeAttribute(attr.name);
            }
            if ((attr.name.toLowerCase() === 'href' || attr.name.toLowerCase() === 'src') && /^javascript:/i.test(attr.value || '')) {
                element.removeAttribute(attr.name);
            }
        }
    };

    const scrubTree = (/** @type {any} */ root) => {
        if (!(root instanceof Element || root instanceof DocumentFragment)) return;
        if (root instanceof Element) scrubElement(root);
        root.querySelectorAll?.('*').forEach((/** @type {any} */ node) => scrubElement(node));
    };

    const observer = new MutationObserver((/** @type {any} */ mutations) => {
        mutations.forEach((/** @type {any} */ mutation) => {
            mutation.addedNodes.forEach((/** @type {any} */ node) => scrubTree(node));
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}
