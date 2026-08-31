export class VirtualizedTrackList {
    /**
     * @param {{
     *   container: HTMLElement,
     *   rowHeight: number,
     *   overscan?: number,
     *   renderRow: (item: any, index: number) => HTMLElement
     * }} options
     */
    constructor(options) {
        this.container = options.container;
        this.rowHeight = Math.max(1, options.rowHeight);
        this.overscan = Math.max(2, Number(options.overscan || 8));
        this.renderRow = options.renderRow;
        this.items = [];

        this.viewport = document.createElement('div');
        this.viewport.className = 'relative w-full';

        this.spacer = document.createElement('div');
        this.spacer.className = 'w-full';

        this.content = document.createElement('div');
        this.content.className = 'absolute left-0 right-0 top-0';

        this.viewport.appendChild(this.spacer);
        this.viewport.appendChild(this.content);

        this.container.innerHTML = '';
        this.container.appendChild(this.viewport);

        this.container.addEventListener('scroll', () => this.render());
        window.addEventListener('resize', () => this.render());
    }

    /**
     * @param {any[]} items
     */
    setItems(items) {
        this.items = Array.isArray(items) ? items : [];
        this.spacer.style.height = `${this.items.length * this.rowHeight}px`;
        this.render();
    }

    render() {
        const height = this.container.clientHeight || 1;
        const scrollTop = this.container.scrollTop || 0;
        const firstVisible = Math.floor(scrollTop / this.rowHeight);
        const visibleCount = Math.ceil(height / this.rowHeight);
        const start = Math.max(0, firstVisible - this.overscan);
        const end = Math.min(this.items.length, firstVisible + visibleCount + this.overscan);

        this.content.style.transform = `translateY(${start * this.rowHeight}px)`;
        this.content.innerHTML = '';

        for (let index = start; index < end; index += 1) {
            const node = this.renderRow(this.items[index], index);
            node.style.height = `${this.rowHeight}px`;
            this.content.appendChild(node);
        }
    }
}
