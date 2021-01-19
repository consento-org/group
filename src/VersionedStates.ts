import { Timestamp } from '@consento/hlc'
import { EmptySet, ReadonlySet, States } from './States'

export type Version <T extends string> = Omit<States<T>, '#byState' | 'set' | 'delete'> & {
  previous: Version<T>
  timestamp: Timestamp
  [Symbol.iterator]: () => Iterator<[id: string, state: T]>
}

class InitialVersion implements Version<string> {
  previous = this
  timestamp = new Timestamp({ wallTime: 0, logical: 0 })
  byState (): ReadonlySet<string> {
    return EmptySet
  }

  has (): boolean {
    return false
  }

  get (): string | undefined {
    return undefined
  }

  * [Symbol.iterator] (): Iterator<[id: string, state: string]> {}
}

const initialVersion = new InitialVersion()

class DeleteVersion <T extends string> implements Version<T> {
  timestamp: Timestamp
  id: string
  prevState: T | undefined
  previous: Version<T>
  prevStateSet: ReadonlySet<string>

  constructor (timestamp: Timestamp, previous: Version<T>, id: string) {
    this.timestamp = timestamp
    this.previous = previous
    this.id = id
    const prevState = previous.get(id)
    this.prevState = prevState
    if (prevState !== undefined) {
      const prevStateSet = previous.byState(prevState)
      this.prevStateSet = {
        has: requestedId => {
          if (id === requestedId) return false
          return prevStateSet.has(requestedId)
        },
        size: prevStateSet.size - 1,
        * [Symbol.iterator] () {
          for (const requestedId of prevStateSet) {
            if (requestedId !== id) {
              yield requestedId
            }
          }
        }
      }
    } else {
      this.prevStateSet = EmptySet
    }
  }

  * [Symbol.iterator] (): Iterator<[id: string, state: T]> {
    for (const entry of this.previous) {
      if (entry[0] !== this.id) {
        yield entry
      }
    }
  }

  byState (state: T): ReadonlySet<string> {
    if (this.prevState === state) {
      return this.prevStateSet
    }
    return this.previous.byState(state)
  }

  has (id: string): boolean {
    if (id === this.id) return false
    return this.previous.has(id)
  }

  get (id: string): T | undefined {
    if (id === this.id) return undefined
    return this.previous.get(id)
  }
}

class SetVersion <T extends string> extends DeleteVersion<T> {
  valueSet: ReadonlySet<string>
  state: T

  constructor (timestamp: Timestamp, previous: Version<T>, id: string, state: T) {
    super(timestamp, previous, id)

    this.state = state
    const valueSet = previous.byState(state)
    this.valueSet = {
      has: requestedId => {
        if (id === requestedId) return true
        return valueSet.has(requestedId)
      },
      size: valueSet.size + 1,
      * [Symbol.iterator] () {
        for (const requestedId of valueSet) {
          yield requestedId
        }
        yield id
      }
    }
  }

  byState (state: T): ReadonlySet<string> {
    if (this.state === state) {
      return this.valueSet
    }
    return super.byState(state)
  }

  has (id: string): boolean {
    if (id === this.id) return true
    return super.has(id)
  }

  get (id: string): T | undefined {
    if (id === this.id) return this.state
    return super.get(id)
  }

  * [Symbol.iterator] (): Iterator<[id: string, state: T]> {
    const iter = super[Symbol.iterator]()
    while (true) {
      const entry = iter.next()
      if (entry.done === true) break
      else yield entry.value
    }
    yield [this.id, this.state]
  }
}

export class VersionedStates <State extends string> implements Iterable<[id: string, state: State]> {
  #latest: Version<State> = initialVersion as Version<State>

  byState (state: State): ReadonlySet<string> {
    return this.#latest.byState(state)
  }

  get latest (): Version<State> {
    return this.#latest
  }

  at (timestamp: Timestamp): Version<State> {
    let version: Version<State> = this.#latest
    while (version.timestamp.compare(timestamp) > 0) {
      version = version.previous
    }
    return version
  }

  set (timestamp: Timestamp, id: string, state: State): void {
    this.#latest = new SetVersion(timestamp, this.#latest, id, state)
  }

  delete (timestamp: Timestamp, id: string): void {
    this.#latest = new DeleteVersion(timestamp, this.#latest, id)
  }

  * [Symbol.iterator] (): Iterator<[id: string, state: State]> {
    for (const entry of this.#latest) {
      yield entry
    }
  }

  has (id: string): boolean {
    return this.#latest.has(id)
  }

  get (id: string): State | undefined {
    return this.#latest.get(id)
  }
}
