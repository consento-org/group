import { Timestamp } from '@consento/hlc'

import { ID } from './FeedItem'
import { VersionedStates } from './VersionedStates'
import { ReadonlySet } from './States'

export type MemberState = 'added' | 'removed'

export class MemberList {
  private readonly _state = new VersionedStates<MemberState>()

  add (member: ID, timestamp: Timestamp): void {
    this._state.set(timestamp, member, 'added')
  }

  remove (member: ID, timestamp: Timestamp): void {
    this._state.set(timestamp, member, 'removed')
  }

  added (at? : Timestamp): ReadonlySet<ID> {
    if (at === undefined) {
      return this._state.byState('added')
    } else {
      return this._state.at(at).byState('added')
    }
  }

  removed (at? : Timestamp): ReadonlySet<ID> {
    if (at === undefined) {
      return this._state.byState('removed')
    } else {
      return this._state.at(at).byState('removed')
    }
  }

  state (member: ID): MemberState | undefined {
    return this._state.get(member)
  }
}
