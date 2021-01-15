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
  readonly signatures = new Map<RequestId, Set<MemberId>>()

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
      throw new Error(`Received response to the already-finished request "${response.id}".`)
    }
    const openRequest = this.openRequests.get(response.id)
    if (response.response === 'cancel') {
      return this.handleCancel(response, openRequest)
    }
    if (response.response === 'deny') {
      return this.handleDeny(response, openRequest)
    }
    if (response.response === 'accept') {
      return this.handleAccept(response, openRequest)
    }
    throw new Error('todo')
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
    const amountMembers = this.members.byState.added?.size ?? 0
    // The signature of the member that created the request is not necessary
    const neededSignatures = amountMembers - 1
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
    if (request.operation === 'merge') {
      throw new Error('todo')
    }
    if (request.operation === 'add') {
      this.members.set(request.who, 'added')
    } else {
      this.members.set(request.who, 'removed')
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
    if (request.operation === 'merge') {
      throw new Error('todo')
    }
    const memberState = this.members.get(request.who)
    if (request.operation === 'remove') {
      if (memberState === undefined) {
        throw new Error(`Cant remove ${request.who} because it is not a member.`)
      }
    } else {
      if (memberState === 'removed') {
        throw new Error(`Cant add previously removed member ${request.who}`)
      }
      if (memberState === 'added') {
        throw new Error(`Cant add ${request.who} as it is already added`)
      }
    }
    this.openRequests.set(request.id, request)
    this.requests.set(
      request.id,
      pushToMapped(this.openRequestsByMember, request.from, request) === 1 ? 'active' : 'pending'
    )
    if (this.requests.get(request.id) === 'active' && this.getRequiredSignatures(request) <= 0) {
      this.finishRequest(request)
    }
  }
}
