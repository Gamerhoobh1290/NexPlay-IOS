export class ActionRegistry {
    /**
     * @param {HTMLElement | Document} root
     */
    constructor(root = document) {
        this.root = root;
        /** @type {Map<string, (event: Event, element: HTMLElement) => void | Promise<void>>} */
        this.handlers = new Map();
        this.bound = false;
    }

    /**
     * @param {string} action
     * @param {(event: Event, element: HTMLElement) => void | Promise<void>} handler
     */
    register(action, handler) {
        this.handlers.set(action, handler);
        if (!this.bound) this.#bind();
    }

    #bind() {
        this.bound = true;
        this.root.addEventListener('click', (event) => {
            const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target.closest('[data-action]') : null);
            if (!target) return;
            const action = target.getAttribute('data-action');
            if (!action) return;
            const handler = this.handlers.get(action);
            if (!handler) return;
            event.preventDefault();
            handler(event, target);
        });
    }
}
