import { Request } from './member'
import { States } from './States'

export type MemberState = 'added' | 'removed'
export type MemberId = string

const emptySet = new Set()

export class Permissions {
  readonly members = new States<MemberState>()

  add (item: Request): void {
    const members = this.members.byState.added ?? emptySet as Set<MemberId>
    if (members.size === 0) {
      if (item.who !== item.from) {
        throw new Error('The first member can only add itself.')
      }
      if (item.operation !== 'add') {
        throw new Error('First request needs to be an add request.')
      }
      this.members.set(item.who, 'added')
      return
    }
    if (!members.has(item.from)) {
      throw new Error('unknown member')
    }
    throw new Error('todo')
  }
}
