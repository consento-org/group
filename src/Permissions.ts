import { FeedItem, isRequest, isResponse, Request, Response } from './FeedItem'
import { States } from './States'
import { MemberList } from './MemberList'
import HLC, { Timestamp } from '@consento/hlc'

export type RequestState = 'finished' | 'denied' | 'active' | 'pending' | 'conflicted' | 'cancelled'
export type MemberId = string
export type RequestId = string

function pushToMapped <K, V> (map: Map<K, V[]>, key: K, value: V): number {
  const list = map.get(key)
  if (list === undefined) {
    map.set(key, [value])
    return 1
  }
  return list.push(value)
}

export class Permissions {
  readonly members = new MemberList()
  readonly requests = new States<RequestState>()
  readonly clock = new HLC()
  readonly signatures = new Map<RequestId, Set<MemberId>>()

  private readonly memberTime = new Map<MemberId, Timestamp>()
  private readonly openRequestsByMember = new Map<MemberId, Request[]>()
  private readonly latestRequestTimestamp = new Map<RequestId, Timestamp>()
  readonly openRequests = new Map<RequestId, Request>()

  get currentMembers (): MemberId[] {
    return [...this.members.added()]
  }

  get isLocked (): boolean {
    const hasRemoved = this.members.removed().size !== 0

    // We havn't removed members yet, so the system is still active: case before the first member.
    if (!hasRemoved) return false

    const hasAdded = this.members.added().size !== 0

    // If all members are removed, no new members can be possibly added; The system is locked.
    return !hasAdded
  }

  add <Input extends FeedItem> (item: Input): Input {
    const members = this.currentMembers
    if (members.length === 0) {
      if (!isRequest(item)) {
        throw new Error('First feed-item needs to be a request.')
      }
      if (item.who !== item.from) {
        throw new Error('The first member can only add itself.')
      }
      if (item.operation !== 'add') {
        throw new Error('First request needs to be an add request.')
      }
      if (this.isLocked) {
        throw new Error('All members were removed.')
      }
    } else {
      if (!members.includes(item.from)) {
        throw new Error('unknown member')
      }
    }
    const lastTime = this.memberTime.get(item.from)
    if (lastTime !== undefined && lastTime.compare(item.timestamp) >= 0) {
      throw new Error(`Order error: The last item from "${item.from}" is newer than this request.`)
    }

    if (isRequest(item)) {
      this.handleRequest(item)
    } else if (isResponse(item)) {
      this.handleResponse(item)
    } else {
      throw new Error('Invalid FeedItem')
    }

    // We should only update the timestamp on valid blocks that didn't throw
    this.memberTime.set(item.from, item.timestamp)
    this.clock.update(item.timestamp)

    return item
  }

  private handleResponse (response: Response): void {
    const state = this.requests.get(response.id)
    if (state === undefined) {
      throw new Error(`Response for unknown request ${response.id}`)
    }
    if (state === 'finished') {
      throw new Error(`Received response to the already-finished request "${response.id}".`)
    }
    const { timestamp } = response
    const existingTimestamp = this.latestRequestTimestamp.get(response.id)
    if ((existingTimestamp !== undefined) && timestamp.compare(existingTimestamp) > 0) {
      this.latestRequestTimestamp.set(response.id, timestamp)
    }
    const openRequest = this.openRequests.get(response.id)
    if (response.response === 'cancel') {
      this.handleCancel(response, openRequest)
    } else if (response.response === 'deny') {
      this.handleDeny(response, openRequest)
    } else if (response.response === 'accept') {
      this.handleAccept(response, openRequest)
    } else {
      throw new Error('Invalid response type')
    }
  }

  private handleAccept (response: Response, openRequest?: Request): void {
    if (openRequest !== undefined) {
      if (openRequest.from === response.from) {
        throw new Error('Cant accept own request.')
      }
      const signatures = this.addSignature(response)
      if (signatures >= this.getRequiredSignatures(openRequest)) {
        this.finishRequest(openRequest)
      }
    }
    // TODO: should we thrown an error if the request is not active
  }

  private getRequiredSignatures (request: Request): number {
    const requestTime = request.timestamp

    const knownAtTime = this.members.added(requestTime)

    const amountMembers = knownAtTime.size

    // The signature of the member that created the request is not necessary
    const neededSignatures = amountMembers - 1
    if (
      // Remove operations are okay with having one less
      request.operation === 'remove' &&
      // Two members can form a majority, to remove one of two members
      // unilaterally is impossible
      amountMembers > 2
    ) {
      return neededSignatures - 1
    }
    return neededSignatures
  }

  private addSignature (response: Response): number {
    const signatures = this.signatures.get(response.id)
    if (signatures === undefined) {
      this.signatures.set(response.id, new Set(response.from))
      return 1
    }
    if (signatures.has(response.from)) {
      throw new Error(`${response.from} tried to sign the same request twice`)
    }
    signatures.add(response.from)
    return signatures.size
  }

  private finishRequest (request: Request): void {
    const timestamp = this.latestRequestTimestamp.get(request.id)
    if (timestamp === undefined) throw new Error('No request time found')
    const id = request.who
    if (request.operation === 'add') {
      this.members.add(id, timestamp)
    } else {
      this.members.remove(id, timestamp)
    }
    this.requests.set(request.id, 'finished')
    this.openRequests.delete(request.id)
    this.signatures.delete(request.id)
    const list = this.openRequestsByMember.get(request.from)
    if (list === undefined) {
      throw new Error('This may never occur')
    }
    if (list.shift() !== request) {
      throw new Error('This may also never occur')
    }
    const entry = list[0]
    if (entry === undefined) {
      this.openRequestsByMember.delete(request.from)
    } else {
      this.requests.set(entry.id, 'active')
    }
    this.latestRequestTimestamp.delete(request.id)
  }

  private handleCancel (response: Response, openRequest?: Request): void {
    if (openRequest !== undefined) {
      if (openRequest.from !== response.from) {
        throw new Error(`Member ${response.from} can not cancel the request ${response.id} by ${openRequest.from}.`)
      }
      this.requests.set(response.id, 'cancelled')
      this.openRequests.delete(response.id)
      this.openRequestsByMember.delete(response.id)
    }
    // TODO: Should we throw an error if the request is not active?
  }

  private handleDeny (response: Response, openRequest?: Request): void {
    if (openRequest !== undefined) {
      if (openRequest.from === response.from) {
        throw new Error(`Member ${response.from} can not deny their own request ${response.id}. Maybe they meant to cancel?`)
      }
      this.requests.set(response.id, 'denied')
      this.openRequests.delete(response.id)
      this.openRequestsByMember.delete(response.id)
    }
    // TODO: Should we throw an error if the request is not active?
  }

  private handleRequest (request: Request): void {
    // TODO: Throw an error if requester already has an active request
    if (this.requests.has(request.id)) {
      throw new Error(`Request ID=${request.id} has already been used.`)
    }
    const existing = this.openRequestsByMember.get(request.from)

    if (existing !== undefined && existing.length !== 0) {
      throw new Error(`Member ${request.from} already has an open request`)
    }

    const memberState = this.members.state(request.who)
    if (request.operation === 'remove') {
      if (memberState === undefined) {
        throw new Error(`Cant remove ${request.who} because it is not a member.`)
      }
    } else if (memberState !== undefined) {
      if (memberState === 'removed') {
        throw new Error(`Cant add previously removed member ${request.who}`)
      }
      if (memberState === 'added') {
        throw new Error(`Cant add ${request.who} as it is already added`)
      }
    }
    this.openRequests.set(request.id, request)
    this.latestRequestTimestamp.set(request.id, request.timestamp)
    this.requests.set(
      request.id,
      pushToMapped(this.openRequestsByMember, request.from, request) === 1 ? 'active' : 'pending'
    )
    if (this.requests.get(request.id) === 'active' && this.getRequiredSignatures(request) <= 0) {
      this.finishRequest(request)
    }
  }
}
