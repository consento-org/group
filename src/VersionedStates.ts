import { Timestamp } from '@consento/hlc'
import { ReadonlySet, States } from './States'

export type Version <State extends string> = Omit<States<State>, '#byState' | 'set' | 'delete' | 'byState'> & {
  byState: (state: State) => HistoryStateView<State>
  [Symbol.iterator]: () => Iterator<[key: string, value: State]>
  iterateWithTime: () => IterableIterator<[key: string, value: State, timestamp: Timestamp]>
}

interface Entry <State extends string> {
  timestamp: Timestamp
  id: string
  state?: State
}

export class HistoryStateView <State extends string> implements ReadonlySet<string> {
  view: HistoryView<State>
  state: State

  constructor (view: HistoryView<State>, state: State) {
    this.view = view
    this.state = state
  }

  * [Symbol.iterator] (): Iterator<string, any, undefined> {
    for (const [key, state] of this.view) {
      if (state === this.state) yield key
    }
  }

  has (entry: string): boolean {
    for (const child of this) {
      if (child === entry) return true
    }
    return false
  }

  get size (): number {
    let size = 0
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _any of this) size += 1
    return size
  }
}

class HistoryView <State extends string> implements Version<State> {
  timestamp: Timestamp | null
  history: Array<Entry<State>>

  constructor (timestamp: Timestamp | null, history: Array<Entry<State>>) {
    this.timestamp = timestamp
    this.history = history
  }

  has (id: string): boolean {
    return this.get(id) !== undefined
  }

  byState (state: State): HistoryStateView<State> {
    return new HistoryStateView(this, state)
  }

  get (id: string): State | undefined {
    for (const [key, value] of this) {
      if (key === id) return value
    }
  }

  * [Symbol.iterator] (): Iterator<[key: string, value: State]> {
    for (const [key, value] of this.iterateWithTime()) {
      yield [key, value]
    }
  }

  // Iterate from oldest to newest
  iterateWithTime (): IterableIterator<[key: string, value: State, timestamp: Timestamp]> {
    const alreadyFound = new Set()
    const entries: Array<[key: string, value: State, timestamp: Timestamp]> = []
    for (const entry of this.history) {
      if (this.timestamp !== null && entry.timestamp.compare(this.timestamp) > 0) {
        continue
      }
      if (alreadyFound.has(entry.id)) {
        continue
      }
      alreadyFound.add(entry.id)
      if (entry.state !== undefined) {
        entries.unshift([entry.id, entry.state, entry.timestamp])
      }
    }
    return entries[Symbol.iterator]()
  }
}

export class VersionedStates <State extends string> implements Iterable<[id: string, state: State]> {
  // Newest: 0; Oldest: N
  history: Array<Entry<State>> = []
  latest: Version<State>

  constructor () {
    this.latest = new HistoryView(null, this.history)
  }

  byState (state: State): HistoryStateView<string> {
    return this.latest.byState(state)
  }

  at (timestamp: Timestamp): Version<State> {
    return new HistoryView(timestamp, this.history)
  }

  iterateWithTime (): Iterator<[id: string, state: State, timestamp: Timestamp]> {
    return this.latest.iterateWithTime()
  }

  set (timestamp: Timestamp, id: string, state: State): void {
    this.history.unshift({ timestamp, id, state })
    this._update()
  }

  delete (timestamp: Timestamp, id: string): void {
    this.history.unshift({ timestamp, id })
    this._update()
  }

  _update (): void {
    this.history = this.history.sort(({ timestamp: a }, { timestamp: b }) => a.compare(b) * -1)
  }

  [Symbol.iterator] (): Iterator<[id: string, state: State]> {
    return this.latest[Symbol.iterator]()
  }

  has (id: string): boolean {
    return this.latest.has(id)
  }

  get (id: string): State | undefined {
    return this.latest.get(id)
  }
}
