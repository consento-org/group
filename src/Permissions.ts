import { FeedItem, isRequest } from './member'
import { States } from './States'

export type MemberState = 'added' | 'removed'
export type RequestState = 'finished' | 'denied' | 'active' | 'pending' | 'conflicted' | 'cancelled'
export type MemberId = string

const emptySet = new Set()

export class Permissions {
  readonly members = new States<MemberState>()
  readonly requests = new States<RequestState>()

  add (item: FeedItem): void {
    const members = this.members.byState.added ?? emptySet as Set<MemberId>
    if (members.size === 0) {
      if (!isRequest(item)) {
        throw new Error('First feed-item needs to be a request.')
      }
      if (item.who !== item.from) {
        throw new Error('The first member can only add itself.')
      }
      if (item.operation !== 'add') {
        throw new Error('First request needs to be an add request.')
      }
      this.members.set(item.who, 'added')
      this.requests.set(item.id, 'finished')
      return
    }
    if (!members.has(item.from)) {
      throw new Error('unknown member')
    }
    if (isRequest(item)) {
      if (item.operation === 'add') {
        if (members.size < 2) {
          this.members.set(item.who, 'added')
          this.requests.set(item.id, 'finished')
          return
        }
        this.requests.set(item.id, 'active')
        return
      }
    }
    throw new Error('todo')
  }
}
