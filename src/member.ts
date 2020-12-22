import { randomBytes } from 'crypto'
import { EventEmitter } from 'events'

export type ResponseType = 'accept' | 'deny' | 'cancel' | 'conflict'
export type ResponseState =
  | 'pending'
  | 'ready'
  | 'cancelled'
  | 'failed'
  | 'finished'
export type Operation = 'add' | 'remove' | 'merge'
export type RequestIdentifier = 'request'
export type ResponseIdentifier = 'response'
export type FeedItem = Request | Response

export type ID = string

export const REQUEST_TYPE = 'request' as RequestIdentifier
export const RESPONSE_TYPE = 'response' as ResponseIdentifier

interface RawRequest {
  // Used to differentiate between req/res
  type: RequestIdentifier
  // ID of the request
  id: ID
  // ID of the creator
  from: ID
  // What sort of operation this is
  operation: Operation
}

export interface WhoRequest extends RawRequest {
  // Who to add or remove
  who: ID
}

export interface MergeRequest extends RawRequest {
  // Which requests have been merged for this one
  toMerge: Request[]
}

export type Request = WhoRequest | MergeRequest

export interface Response {
  // Used to differentiate between req/res
  type: ResponseIdentifier
  // ID of the request
  id: ID
  // ID of the request creator
  from: ID
  // Our response to this request
  response: ResponseType
}

export class RequestState {
  req: Request
  signatures: {
    [id in ID]: Response;
  }

  finished: boolean
  lastState: ResponseState

  constructor (req: Request) {
    this.req = req
    this.signatures = {}
    this.finished = false
    this.lastState = 'pending'
  }

  isSignedBy (id: ID): boolean {
    return this.signatures[id] !== undefined
  }

  calculateState (
    neededSignatures: number,
    maxDenied: number = neededSignatures
  ): ResponseState {
    let state: ResponseState = 'pending'
    if (this.finished) state = 'finished'
    if (this.isCancelled()) state = 'cancelled'
    if (this.isConflicted()) state = 'failed'
    if (this.numberAccepted() >= neededSignatures) state = 'ready'
    if (this.numberDenied() > maxDenied) state = 'failed'

    this.lastState = state

    return state
  }

  addResponse (author: ID, response: Response): void {
    this.signatures[author] = response
  }

  get id (): ID {
    return this.req.id
  }

  get from (): ID {
    return this.req.from
  }

  get operation (): Operation {
    return this.req.operation
  }

  numberDenied (): number {
    return Object.keys(this.signatures).filter((id: ID) => {
      return this.signatures[id].response === 'deny'
    }).length
  }

  numberAccepted (): number {
    return Object.keys(this.signatures).filter((id: ID) => {
      return this.signatures[id].response === 'accept'
    }).length
  }

  isConflicted (): boolean {
    return Object.keys(this.signatures).some((id: ID) => {
      return this.signatures[id].response === 'conflict'
    })
  }

  isCancelled (): boolean {
    return this.signatures[this.from]?.response === 'cancel'
  }

  finish (): void {
    this.finished = true
  }
}

function allowAll (_request: Request): boolean {
  return true
}

export type ShouldAcceptCB = (request: Request) => boolean

export interface MemberConstructorOptions {
  id?: ID
  initiator?: ID
  shouldAccept?: ShouldAcceptCB
}

export class Member extends EventEmitter {
  id: ID
  ownFeed: FeedItem[]
  knownFeeds: {
    [id in ID]: FeedItem[];
  }

  memberIndexes: {
    [id in ID]: number;
  }

  ownIndex: number
  requests: {
    [id in ID]: RequestState;
  }

  knownMembers: string[]
  shouldAccept: ShouldAcceptCB

  constructor (
    { id, initiator, shouldAccept = allowAll }: MemberConstructorOptions = {
      shouldAccept: allowAll
    }
  ) {
    super()
    this.id = id ?? makeID()
    this.ownFeed = []
    this.ownIndex = 0
    this.knownFeeds = {
      [this.id]: this.ownFeed
    }
    this.memberIndexes = {
      [this.id]: 0
    }
    this.requests = {}
    this.knownMembers = [initiator ?? this.id]
    this.shouldAccept = shouldAccept
  }

  sync (member: Member): void {
    // Iterate through member's knownFeeds
    // Get any new data you don't have
    // Get new data from members to knownFeeds
    for (const id of Object.keys(member.knownFeeds)) {
      const feed = member.knownFeeds[id]
      const ownCopy = this.getFeedFor(id)
      if (ownCopy.length < feed.length) {
        this.updateFeedFor(id, feed)
      }
    }

    this.processFeeds()
  }

  processFeeds (): boolean {
    let hasProcessed = false
    const hasResponded = false
    for (const id of this.knownMembers) {
      const index = this.getMemberIndexFor(id)
      const feed = this.getFeedFor(id)
      const item = feed[index]
      if (item === undefined) continue
      hasProcessed = true

      if (isRequest(item)) {
        this.trackRequest(item)

        this.incrementMemberIndexFor(id)
      } else if (isResponse(item)) {
        if (this.hasRequest(item.id)) {
          const req = this.getRequest(item.id)
          req.addResponse(id, item)

          let neededSignatures = this.knownMembers.length
          if (req.operation === 'remove') neededSignatures--

          const maxDenied = this.knownMembers.length - neededSignatures

          const state = req.calculateState(neededSignatures, maxDenied)

          if (state === 'ready') {
            if (req.operation === 'add') {
              if (isWhoRequest(req.req)) {
                const who = req.req.who
                this.knownMembers.push(who)
              }
            } else if (req.operation === 'remove') {
              if (isWhoRequest(req.req)) {
                const who = req.req.who
                this.knownMembers = this.knownMembers.filter(
                  (id) => id !== who
                )
              }
            }
            req.finish()
            if (this.isMember()) {
              this.emit('block', req)
            }
          }
          this.incrementMemberIndexFor(id)
        } else {
          continue
        }
      } else {
        console.warn('Got invalid item', item)
        this.incrementMemberIndexFor(id)
      }
    }

    if (hasProcessed) {
      const otherRun = this.processFeeds()
      return hasResponded || otherRun
    } else return hasResponded
  }

  private updateFeedFor (id: ID, feed: FeedItem[]): void {
    this.knownFeeds[id] = feed.slice(0)
  }

  private hasNewFeedItemsFor (id: ID): boolean {
    return this.getMemberIndexFor(id) === this.getFeedFor(id).length - 1
  }

  private getMemberIndexFor (id: ID): number {
    if (this.memberIndexes[id] !== undefined) return this.memberIndexes[id]
    this.memberIndexes[id] = 0
    return 0
  }

  private incrementMemberIndexFor (id: ID): void {
    this.memberIndexes[id] = this.getMemberIndexFor(id) + 1
  }

  private getFeedFor (id: ID): FeedItem[] {
    if (this.knownFeeds[id] === undefined) {
      this.knownFeeds[id] = []
    }

    return this.knownFeeds[id]
  }

  private hasRequest (id: ID): boolean {
    return this.requests[id] !== undefined
  }

  private trackRequest (request: Request): void {
    const { id } = request
    this.requests[id] = new RequestState(request)
  }

  private getRequest (id: ID): RequestState {
    return this.requests[id]
  }

  requestAdd (who: ID): Request {
    return this.makeRequest(who, 'add')
  }

  requestRemove (who: ID): Request {
    return this.makeRequest(who, 'remove')
  }

  makeRequest (who: ID, operation: Operation): Request {
    const req = {
      type: REQUEST_TYPE,
      id: makeID(),
      from: this.id,
      who,
      operation
    }

    this.ownFeed.push(req)

    // Automatically accept requests you created
    this.acceptRequest(req)

    this.processFeeds()

    return req
  }

  makeResponse (request: Request, response: ResponseType): Response {
    const { id, from } = request
    const res = {
      type: RESPONSE_TYPE,
      from,
      id,
      response
    }

    this.ownFeed.push(res)

    return res
  }

  acceptRequest (request: Request): Response {
    return this.makeResponse(request, 'accept')
  }

  denyRequest (request: Request): Response {
    return this.makeResponse(request, 'deny')
  }

  getPendingRequests (): RequestState[] {
    const pending = []
    // Down the line we'll want to put finished requests somewhere else
    for (const id of Object.keys(this.requests)) {
      const request = this.requests[id]
      const state = request.lastState
      if (state !== 'pending') continue
      if (request.isSignedBy(this.id)) continue
      pending.push(request)
    }

    return pending
  }

  acceptPending (): number {
    let accepted = 0
    for (const requestState of this.getPendingRequests()) {
      this.acceptRequest(requestState.req)
      accepted++
    }

    this.processFeeds()

    return accepted
  }

  isMember (): boolean {
    return this.knownMembers.includes(this.id)
  }
}

export function isRequest (item: FeedItem): item is Request {
  return item.type === REQUEST_TYPE
}

export function isResponse (item: FeedItem): item is Response {
  return item.type === RESPONSE_TYPE
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isMergeRequest (item: Request): item is MergeRequest {
  return (item as MergeRequest).toMerge !== undefined
}

function isWhoRequest (item: Request): item is WhoRequest {
  return (item as WhoRequest).who !== undefined
}

function makeID (): ID {
  return randomBytes(8).toString('hex')
}
