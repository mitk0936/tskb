type PendingResolver<T> = (value: IteratorResult<T>) => void;

export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly resolvers: PendingResolver<T>[] = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;

    const resolver = this.resolvers.shift();

    if (resolver) {
      resolver({
        done: false,
        value: item,
      });

      return;
    }

    this.items.push(item);
  }

  /**
   * Ends the queue: any parked reader resolves `{ done: true }` immediately, and
   * once already-buffered items are drained, future reads do too. Idempotent.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    // Unblock everyone parked — nothing more is coming.
    for (const resolve of this.resolvers.splice(0)) resolve({ done: true, value: undefined });
  }

  private next(): Promise<IteratorResult<T>> {
    const item = this.items.shift();

    if (item !== undefined) {
      return Promise.resolve({
        done: false,
        value: item,
      });
    }

    // Drained and closed → the iteration is over.
    if (this.closed) return Promise.resolve({ done: true, value: undefined });

    return new Promise((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
    };
  }
}
