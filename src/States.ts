export interface ReadonlySet <T> {
  has: (entry: T) => boolean
  [Symbol.iterator]: () => Iterator<string>
  size: number
}

export const EmptySet: ReadonlySet<any> = {
  has: (_: string) => false,
  [Symbol.iterator]: function * (): Iterator<string> {},
  size: 0
}

export class States <State extends string> implements Iterable<[id: string, state: State]> {
  readonly #byState: Partial<{ [state in State]: Set<string> }> = {}

  byState (state: State): ReadonlySet<string> {
    return this.#byState[state] ?? EmptySet
  }

  has (id: string): boolean {
    return this.get(id) !== undefined
  }

  get (id: string): State | undefined {
    for (const bucketState in this.#byState) {
      if (bucketState !== undefined) {
        const bucket = this.#byState[bucketState]
        if (bucket?.has(id) ?? false) {
          return bucketState
        }
      }
    }
    return undefined
  }

  set (id: string, state: State): void {
    const didSet = !this.clear(id, state)
    if (didSet) {
      return
    }
    const bucket = this.#byState[state]
    if (bucket === undefined) {
      this.#byState[state] = new Set([id])
      return
    }
    bucket.add(id)
  }

  delete (id: string): void {
    this.clear(id)
  }

  * [Symbol.iterator] (): Iterator<[id: string, state: State]> {
    for (const bucketState in this.#byState) {
      const bucket = this.#byState[bucketState] as Set<string>
      if (bucket !== undefined) {
        for (const entry of bucket) {
          yield [entry, bucketState]
        }
      }
    }
  }

  private clear (id: string, unlessState?: State): boolean {
    for (const bucketState in this.#byState) {
      const bucket = this.#byState[bucketState] as Set<string>
      if (!bucket.has(id)) {
        continue
      }
      if (bucketState === unlessState) {
        return false
      }
      bucket.delete(id)
      return true
    }
    return true
  }
}
