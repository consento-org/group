import {
  ID,
  Request,
  Response
} from './FeedItem'
import { Permissions } from './Permissions'
import { Sync } from './Sync'
import { randomBytes } from 'crypto'
import { Timestamp } from '@consento/hlc'
import { Feed } from './Feed'

export interface MemberOptions {
  id?: ID
  initiator?: ID
}

export class Member {
  readonly feed: Feed
  readonly syncState: Sync = new Sync()
  readonly id: ID
  readonly initiator: ID

  constructor ({
    id = randomBytes(8).toString('hex'),
    initiator = id
  }: MemberOptions = {}) {
    this.id = id
    this.initiator = initiator
    this.feed = new Feed(id)

    if (id === initiator) {
      this.requestAdd(this.id)
    }
  }

  get permissions (): Permissions {
    return this.syncState.permissions
  }

  get knownMembers (): ID[] {
    if (this.permissions.isLocked) return []
    const currentMembers = this.permissions.currentMembers
    if (currentMembers.size === 0) return [this.initiator]
    return [...currentMembers]
  }

  sync (other: Member): void {
    this.syncState.sync(other.syncState)
  }

  processFeeds (): void {
    this.syncState.processFeeds()
  }

  requestAdd (who: ID): Request {
    const req = this.feed.addRequest({
      operation: 'add',
      who,
      timestamp: this.now()
    })
    this.acceptRequest(req)
    this.processFeeds()
    return req
  }

  requestRemove (who: ID): Request {
    const req = this.feed.addRequest({
      operation: 'remove',
      who,
      timestamp: this.now()
    })
    this.processFeeds()

    return req
  }

  acceptRequest ({ id }: Request): Response {
    const res = this.feed.addResponse({
      id,
      response: 'accept',
      timestamp: this.now()
    })
    this.processFeeds()
    return res
  }

  denyRequest ({ id }: Request): Response {
    const res = this.feed.addResponse({
      id,
      response: 'deny',
      timestamp: this.now()
    })
    this.processFeeds()
    return res
  }

  getActiveRequests (): Request[] {
    return [...this.permissions.openRequests.values()]
  }

  getUnsignedRequests (): Request[] {
    return this.getActiveRequests().filter(({ id }) => {
      const signatures = this.permissions.signatures.get(id)
      if (signatures === undefined) return true
      return !signatures.has(this.id)
    })
  }

  signUnsigned (): Response[] {
    const toSign = this.getUnsignedRequests()

    const responses = toSign.map((req) => this.acceptRequest(req))

    return responses
  }

  private now (): Timestamp {
    return this.syncState.permissions.clock.now()
  }
}
