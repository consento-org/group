import { FeedItem, isRequest, isResponse, Request, Response } from './member'
import { States } from './States'
import HLC, { Timestamp } from '@consento/hlc'

export type MemberState = 'added' | 'removed'
export type RequestState = 'finished' | 'denied' | 'active' | 'pending' | 'conflicted' | 'cancelled'
export type MemberId = string
export type RequestId = string

const emptySet = new Set()

function pushToMapped <K, V> (map: Map<K, V[]>, key: K, value: V): number {
  const list = map.get(key)
  if (list === undefined) {
    map.set(key, [value])
    return 1
  }
  return list.push(value)
}

export class Permissions {
  readonly members = new States<MemberState>()
  readonly requests = new States<RequestState>()
  readonly clock = new HLC()

  private readonly memberTime = new Map<MemberId, Timestamp>()
  private readonly openRequests = new Map<RequestId, Request>()
  private readonly openRequestsByMember = new Map<MemberId, Request[]>()

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
      return this.handleRequest(item)
    } else if (isResponse(item)) {
      return this.handleResponse(item)
    }
    throw new Error('todo')
  }

  private handleResponse (response: Response): void {
    const state = this.requests.get(response.id)
    if (state === undefined) {
      throw new Error(`Response for unknown request ${response.id}`)
    }
    if (state === 'finished') {
      throw new Error(`Trying to response to the already-finished request "${response.id}".`)
    }
    if (response.response === 'cancel') {
      if (state === 'active' || state === 'pending') {
        const request = this.openRequests.get(response.id) as Request
        if (request.from !== response.from) {
          throw new Error(`Member ${response.from} can not cancel the request ${response.id} by ${request.from}.`)
        }
        this.requests.set(response.id, 'cancelled')
        this.openRequests.delete(response.id)
        this.openRequestsByMember.delete(response.id)
      }
      return
    }
    throw new Error('todo')
  }

  private handleRequest (request: Request): void {
    const members = this.members.byState.added ?? emptySet as Set<MemberId>
    if (request.operation === 'add') {
      if (members.size < 2) {
        this.members.set(request.who, 'added')
        this.requests.set(request.id, 'finished')
        return
      }
      this.openRequests.set(request.id, request)
      this.requests.set(
        request.id,
        pushToMapped(this.openRequestsByMember, request.from, request) === 1 ? 'active' : 'pending'
      )
    } else {
      throw new Error('todo')
    }
  }
}
