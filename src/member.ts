import { randomBytes } from 'crypto'
import { EventEmitter } from 'events'
import HLC, { Timestamp } from '@consento/hlc'

import {
  Request,
  Response,
  FeedItem,
  isRequest,
  isResponse
} from './FeedItem'

export class RequestState {
  req: Request
  signatures: {
    [id in ID]: Response;
  }

  finished: boolean
  lastState: ResponseState
  toSign: ID[]

  constructor (req: Request, toSign: ID[]) {
    this.req = req
    this.signatures = {}
    this.finished = false
    this.lastState = 'pending'
    this.toSign = toSign
  }

  isSignedBy (id: ID): boolean {
    return this.signatures[id] !== undefined
  }

  calculateState (): ResponseState {
    let neededSignatures = this.toSign.length
    if (
      // Remove operations are okay with having one less
      this.req.operation === 'remove' &&
      // Two members can form a majority, to remove one of two members
      // unilaterally is impossible
      this.toSign.length > 2
    ) {
      neededSignatures--
    }

    const maxDenied = this.toSign.length - neededSignatures

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
    if (!this.toSign.includes(author)) {
      throw new Error(`Signed by invalid member: ${author} - ${this.toSign.toString()}`)
    }
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

  get createdAt (): Timestamp {
    return this.req.timestamp
  }

  get who (): ID {
    return this.req.who
  }

  get lastSigned (): Timestamp {
    return Object
      .values(this.signatures)
      .sort((a, b) => a.timestamp.compare(b.timestamp))[0]
      ?.timestamp
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

export interface MemberConstructorOptions {
  id?: ID
  initiator?: ID
}

export class Member extends EventEmitter {
  id: ID

  clock: HLC

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

  // The initial known member for the group
  initiator: ID
  // The finished request history
  finishedRequests: RequestState[]

  constructor (
    { id, initiator }: MemberConstructorOptions = {}
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
    this.initiator = initiator ?? this.id
    this.finishedRequests = []
    this.clock = new HLC()
  }

  get knownMembers (): ID[] {
    const knownMembers: Set<ID> = new Set()
    knownMembers.add(this.initiator)
    this.finishedRequests.sort((a, b) => a.lastSigned.compare(b.lastSigned))
    for (const request of this.finishedRequests) {
      if (request.operation === 'add') {
        knownMembers.add(request.who)
      } else if (request.operation === 'remove') {
        knownMembers.delete(request.who)
      }
    }
    return [...knownMembers]
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

      // TODO: Handle errors with clocks
      this.clock.update(item.timestamp)

      hasProcessed = true

      if (isRequest(item)) {
        this.trackRequest(item)

        this.incrementMemberIndexFor(id)
      } else if (isResponse(item)) {
        if (this.hasRequest(item.id)) {
          const req = this.getRequest(item.id)

          req.addResponse(id, item)

          const state = req.calculateState()

          if (state === 'ready') {
            req.finish()
            this.finishedRequests.push(req)
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
    // Instead of just getting knownMembers
    // We should fetch the knownMembers at the time
    // Recalculate on each sync
    const toSign = this.knownMembers
    this.requests[id] = new RequestState(request, toSign)
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
    const timestamp = this.getTime()
    const req = {
      type: REQUEST_TYPE,
      id: makeID(),
      from: this.id,
      who,
      operation,
      timestamp
    }

    this.ownFeed.push(req)

    // Automatically accept requests you created
    this.acceptRequest(req)

    this.processFeeds()

    return req
  }

  makeResponse (request: Request, response: ResponseType): Response {
    const timestamp = this.getTime()
    const { id, from } = request
    const res = {
      type: RESPONSE_TYPE,
      from,
      id,
      response,
      timestamp
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
      if (!this.knownMembers.includes(request.from)) continue
      pending.push(request)
    }

    return pending
  }

  getActiveRequests (): RequestState[] {
    const foundRequestee = new Set()
    return this.getPendingRequests().filter(request => {
      if (foundRequestee.has(request.from)) {
        return false
      }
      foundRequestee.add(request.from)
      return true
    })
  }

  getUnsignedRequests (): RequestState[] {
    return this.getActiveRequests().filter(request => !request.isSignedBy(this.id))
  }

  signUnsigned (): Request[] {
    const accepted: Request[] = []
    for (const requestState of this.getUnsignedRequests()) {
      this.acceptRequest(requestState.req)
      accepted.push(requestState.req)
    }

    this.processFeeds()

    return accepted
  }

  isMember (): boolean {
    return this.knownMembers.includes(this.id)
  }

  getTime (): Timestamp {
    return this.clock.now()
  }
}

function makeID (): ID {
  return randomBytes(8).toString('hex')
}
