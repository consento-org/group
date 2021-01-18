export interface ReadonlySet <T> {
  has: (entry: T) => boolean
  [Symbol.iterator]: () => Iterator<string>
  size: number
}

const emptySet = {
  has: (_: string) => false,
  [Symbol.iterator]: function * (): Iterator<string> {},
  size: 0
}

export class States <State extends string> implements Iterable<[id: string, state: State]> {
  readonly _byState: Partial<{ [state in State]: Set<string> }> = {}

  byState (state: State): ReadonlySet<string> {
    return this._byState[state] ?? emptySet
  }

  set (id: string, state: State): void {
    if (!this.clear(id, state)) {
      return
    }
    const bucket = this._byState[state]
    if (bucket === undefined) {
      this._byState[state] = new Set([id])
      return
    }
    bucket.add(id)
  }

  delete (id: string): void {
    this.clear(id)
  }

  * [Symbol.iterator] (): Iterator<[id: string, state: State]> {
    for (const bucketState in this._byState) {
      const bucket = this._byState[bucketState] as Set<string>
      if (bucket !== undefined) {
        for (const entry of bucket) {
          yield [entry, bucketState]
        }
      }
    }
  }

  private clear (id: string, unlessState?: State): boolean {
    for (const bucketState in this._byState) {
      const bucket = this._byState[bucketState] as Set<string>
      if (!bucket.has(id)) {
        continue
      }
      if (bucketState === unlessState) {
        return false
      }
      bucket.delete(id)
      if (bucket.size === 0) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this._byState[bucketState]
      }
      return true
    }
    return true
  }

  has (id: string): boolean {
    return this.get(id) !== undefined
  }

  get (id: string): State | undefined {
    for (const bucketState in this._byState) {
      if (bucketState !== undefined) {
        const bucket = this._byState[bucketState]
        if (bucket?.has(id) ?? false) {
          return bucketState
        }
      }
    }
    return undefined
  }
}
