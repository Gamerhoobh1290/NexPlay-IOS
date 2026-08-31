export class BackgroundJobQueue {
    /**
     * @param {{concurrency?: number}=} options
     */
    constructor(options = {}) {
        this.concurrency = Math.max(1, Number(options.concurrency || 2));
        this.running = 0;
        /** @type {{id: string, task: () => Promise<any>, resolve: (value:any)=>void, reject:(reason:any)=>void, cancelled:boolean}[]} */
        this.queue = [];
    }

    /**
     * @param {() => Promise<any>} task
     * @returns {{id:string, promise: Promise<any>, cancel: () => void}}
     */
    add(task) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        let handle;
        const promise = new Promise((resolve, reject) => {
            handle = { id, task, resolve, reject, cancelled: false };
            this.queue.push(handle);
            this.#drain();
        });

        return {
            id,
            promise,
            cancel: () => {
                handle.cancelled = true;
            }
        };
    }

    clear() {
        this.queue.forEach((item) => {
            item.cancelled = true;
            item.reject(new Error('Job cancelled'));
        });
        this.queue = [];
    }

    async #drain() {
        while (this.running < this.concurrency && this.queue.length > 0) {
            const next = this.queue.shift();
            if (!next || next.cancelled) continue;

            this.running += 1;
            Promise.resolve()
                .then(() => next.task())
                .then((value) => {
                    if (!next.cancelled) next.resolve(value);
                })
                .catch((error) => {
                    if (!next.cancelled) next.reject(error);
                })
                .finally(() => {
                    this.running -= 1;
                    this.#drain();
                });
        }
    }
}
