type PendingResolver<T> = (value: IteratorResult<T>) => void;

/** A single-consumer async queue: `push` feeds it, `for await` drains it, `close` ends it. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly resolvers: PendingResolver<T>[] = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ done: false, value: item });
      return;
    }
    this.items.push(item);
  }

  /** Ends the queue: parked readers resolve `{ done: true }`, drained reads too. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const resolve of this.resolvers.splice(0)) resolve({ done: true, value: undefined });
  }

  private next(): Promise<IteratorResult<T>> {
    const item = this.items.shift();
    if (item !== undefined) return Promise.resolve({ done: false, value: item });
    if (this.closed) return Promise.resolve({ done: true, value: undefined });
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return { next: () => this.next() };
  }
}
