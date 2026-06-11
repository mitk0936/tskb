type PendingResolver<T> = (value: IteratorResult<T>) => void;

export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];

  private readonly resolvers: PendingResolver<T>[] = [];

  push(item: T): void {
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

  private next(): Promise<IteratorResult<T>> {
    const item = this.items.shift();

    if (item !== undefined) {
      return Promise.resolve({
        done: false,
        value: item,
      });
    }

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
