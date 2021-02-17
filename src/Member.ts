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
  readonly syncState: Sync
  readonly id: ID
  readonly initiator: ID

  static async create (opts?: MemberOptions): Promise<Member> {
    const member = new Member(opts)
    await member.init()

    return member
  }

  constructor ({
    id = randomBytes(8).toString('hex'),
    initiator = id
  }: MemberOptions = {}) {
    this.id = id
    this.initiator = initiator
    this.feed = new Feed(id)

    this.syncState = new Sync(initiator)

    this.syncState.addFeed(this.feed)
  }

  async init (): Promise<void> {
    if (this.id === this.initiator) {
      await this.requestAdd(this.id)
    }
  }

  get permissions (): Permissions {
    return this.syncState.permissions
  }

  get knownMembers (): ID[] {
    return this.syncState.knownMembers
  }

  async sync (other: Member): Promise<void> {
    await this.syncState.sync(other.syncState)
  }

  async processFeeds (): Promise<void> {
    await this.syncState.processFeeds()
  }

  async requestAdd (who: ID): Promise<Request> {
    const req = await this.feed.addRequest({
      operation: 'add',
      who,
      timestamp: this.now()
    })
    await this.processFeeds()
    return req
  }

  async requestRemove (who: ID): Promise<Request> {
    const req = await this.feed.addRequest({
      operation: 'remove',
      who,
      timestamp: this.now()
    })
    await this.processFeeds()

    return req
  }

  async acceptRequest ({ id }: Request): Promise<Response> {
    const res = this.feed.addResponse({
      id,
      response: 'accept',
      timestamp: this.now()
    })
    await this.processFeeds()
    return await res
  }

  async denyRequest ({ id }: Request): Promise<Response> {
    const res = await this.feed.addResponse({
      id,
      response: 'deny',
      timestamp: this.now()
    })
    await this.processFeeds()
    return res
  }

  getActiveRequests (): Request[] {
    return [...this.permissions.openRequests.values()]
  }

  getUnsignedRequests (): Request[] {
    return this.getActiveRequests().filter(({ id, from }) => {
      if (from === this.id) return false
      const signatures = this.permissions.signatures.get(id)
      if (signatures === undefined) return true
      return !signatures.has(this.id)
    })
  }

  async signUnsigned (): Promise<Response[]> {
    const toSign = this.getUnsignedRequests()
    const responses = []

    for (const req of toSign) {
      const res = await this.acceptRequest(req)
      responses.push(res)
    }

    return responses
  }

  private now (): Timestamp {
    return this.syncState.permissions.clock.now()
  }
}
