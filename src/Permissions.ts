import { FeedItem, isRequest, isResponse } from './member'
import { States } from './States'
import HLC, { Timestamp } from '@consento/hlc'

export type MemberState = 'added' | 'removed'
export type RequestState = 'finished' | 'denied' | 'active' | 'pending' | 'conflicted' | 'cancelled'
export type MemberId = string

const emptySet = new Set()

export class Permissions {
  readonly members = new States<MemberState>()
  readonly requests = new States<RequestState>()
  readonly clock = new HLC()

  private readonly memberTime = new Map<MemberId, Timestamp>()

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
    } else {
      if (!members.has(item.from)) {
        throw new Error('unknown member')
      }
    }
    const lastTime = this.memberTime.get(item.from)
    if (lastTime !== undefined && lastTime.compare(item.timestamp) >= 0) {
      throw new Error(`Order error: The last item from "${item.from}" is newer than this request.`)
    }
    this.memberTime.set(item.from, item.timestamp)
    this.clock.update(item.timestamp)
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
    } else if (isResponse(item)) {
      if (this.requests.get(item.id) !== 'active') {
        throw new Error(`Response for unknown request ${item.id}`)
      }
    }
    throw new Error('todo')
  }
}
