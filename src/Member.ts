import {
  ID,
  Request,
  Response
} from './FeedItem'
import { Permissions } from './Permissions'
import { Sync } from './Sync'
import { randomBytes } from 'crypto'
import { Timestamp } from '@consento/hlc'
import { Feed, FeedLoader, defaultFeedLoader } from './Feed'

export interface MemberOptions {
  id?: ID
  initiator?: ID
  loadFeed?: FeedLoader
}

export class Member {
  _feed?: Feed
  _syncState?: Sync
  readonly _id: ID
  initiator: ID
  private readonly loadFeed: FeedLoader

  static async create (opts?: MemberOptions): Promise<Member> {
    const member = new Member(opts)
    await member.init()

    return member
  }

  constructor ({
    id = randomBytes(8).toString('hex'),
    initiator = id,
    loadFeed = defaultFeedLoader
  }: MemberOptions = {}) {
    this._id = id
    this.initiator = initiator
    this.loadFeed = loadFeed
  }

  isInitiator (): boolean {
    return this.id === this.initiator
  }

  async init (): Promise<void> {
    this._feed = await this.loadFeed(this._id)

    // Workaround for when feeds give you a new ID based on your given ID
    // TODO: Clean this up?
    if (this.initiator === this._id) this.initiator = this.id

    this._syncState = new Sync(this.initiator, this.loadFeed)

    await this.syncState.addFeed(this.feed)

    if (this.isInitiator()) {
      await this.requestAdd(this.id)
    }
  }

  get syncState (): Sync {
    return this._syncState as Sync
  }

  get id (): ID {
    return this.feed.id
  }

  get feed (): Feed {
    return this._feed as Feed
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

    await this.processFeeds()

    return responses
  }

  async close (): Promise<void> {
    // TODO: Should we clear resources here?
    await this.syncState.close()
  }

  now (): Timestamp {
    return this.syncState.permissions.clock.now()
  }
}
