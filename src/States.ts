export class States <State extends string> implements Iterable<[id: string, state: State]> {
  readonly byState: Partial<{ [state in State]: Set<string> }> = {}

  set (id: string, state: State): void {
    if (!this.clear(id, state)) {
      return
    }
    const bucket = this.byState[state]
    if (bucket === undefined) {
      this.byState[state] = new Set([id])
      return
    }
    bucket.add(id)
  }

  delete (id: string): void {
    this.clear(id)
  }

  * [Symbol.iterator] (): Iterator<[id: string, state: State]> {
    for (const bucketState in this.byState) {
      const bucket = this.byState[bucketState] as Set<string>
      if (bucket !== undefined) {
        for (const entry of bucket) {
          yield [entry, bucketState]
        }
      }
    }
  }

  private clear (id: string, unlessState?: State): boolean {
    for (const bucketState in this.byState) {
      const bucket = this.byState[bucketState] as Set<string>
      if (!bucket.has(id)) {
        continue
      }
      if (bucketState === unlessState) {
        return false
      }
      bucket.delete(id)
      if (bucket.size === 0) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.byState[bucketState]
      }
      return true
    }
    return true
  }

  has (id: string): boolean {
    return this.get(id) !== undefined
  }

  get (id: string): State | undefined {
    for (const bucketState in this.byState) {
      if (bucketState !== undefined) {
        const bucket = this.byState[bucketState]
        if (bucket?.has(id) ?? false) {
          return bucketState
        }
      }
    }
    return undefined
  }
}
