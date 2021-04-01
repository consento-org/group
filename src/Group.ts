import {
  ID,
  Request,
  Response
} from './FeedItem'
import { Permissions } from './Permissions'
import { Sync } from './Sync'
import { randomBytes } from 'crypto'
import { Timestamp } from '@consento/hlc'
import { Feed, FeedLoader, defaultFeedLoader, Metadata } from './Feed'

export interface GroupOptions {
  loadFeed?: FeedLoader
  id?: ID
  metadata?: Metadata
}

export class Group {
  _feed?: Feed
  _syncState?: Sync
  _id?: ID
  private readonly loadFeed: FeedLoader

  static async load (options: GroupOptions = {}): Promise<Group> {
    const group = new Group(options)

    const { id = randomBytes(8).toString('hex') } = options

    await group.init(id)

    return group
  }

  static async create (options: GroupOptions = {}): Promise<Group> {
    const group = new Group(options)

    const { id, metadata } = options

    await group.createOwnFeed(id, metadata)

    const finalID = group.feed.id

    await group.init(finalID)

    return group
  }

  constructor ({
    loadFeed = defaultFeedLoader
  }: GroupOptions = {}) {
    this.loadFeed = loadFeed
  }

  isMember (): boolean {
    return this.hasFeed() && this.members.includes(this.feed.id)
  }

  hasFeed (): boolean {
    return this._feed !== undefined
  }

  isInitiator (): boolean {
    if (!this.hasFeed()) return false
    return this.feed.id === this.id
  }

  async createOwnFeed (id?: ID, metadata? : Metadata): Promise<void> {
    const finalID = id ?? randomBytes(8).toString('hex')
    this._feed = await this.loadFeed(finalID)

    if ((metadata !== undefined) && (this.feed.length === 0)) {
      await this.feed.writeMetadata(metadata)
    }

    if (this._syncState !== undefined) {
      await this.syncState.addFeed(this.feed)
    }
  }

  async init (id: ID): Promise<void> {
    this._id = id

    this._syncState = new Sync(this.id, this.loadFeed)

    if (this.hasFeed()) {
      await this.syncState.addFeed(this.feed)
    }

    if (this.isInitiator()) {
      await this.requestAdd(this.feed.id)
    }
  }

  get syncState (): Sync {
    return this._syncState as Sync
  }

  get ownID (): ID {
    if (!this.hasFeed()) throw new Error('Own Feed Not Initialized')
    return this.feed.id
  }

  get id (): ID {
    return this._id as ID
  }

  get feed (): Feed {
    return this._feed as Feed
  }

  get permissions (): Permissions {
    return this.syncState.permissions
  }

  get members (): ID[] {
    return this.syncState.knownMembers
  }

  async sync (other: Group): Promise<void> {
    await this.syncState.sync(other.syncState)
  }

  async processFeeds (): Promise<void> {
    await this.syncState.processFeeds()
  }

  async requestAdd (who: ID): Promise<Request> {
    if (!this.isMember()) throw new Error('Not a member of the group')
    const req = await this.feed.addRequest({
      operation: 'add',
      who,
      timestamp: this.now()
    })
    await this.processFeeds()
    return req
  }

  async requestRemove (who: ID): Promise<Request> {
    if (!this.isMember()) throw new Error('Not a member of the group')
    const req = await this.feed.addRequest({
      operation: 'remove',
      who,
      timestamp: this.now()
    })
    await this.processFeeds()

    return req
  }

  async acceptRequest ({ id }: Request): Promise<Response> {
    if (!this.isMember()) throw new Error('Not a member of the group')
    const res = this.feed.addResponse({
      id,
      response: 'accept',
      timestamp: this.now()
    })
    await this.processFeeds()
    return await res
  }

  async denyRequest ({ id }: Request): Promise<Response> {
    if (!this.isMember()) throw new Error('Not a member of the group')
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
      if (from === this.ownID) return false
      const signatures = this.permissions.signatures.get(id)
      if (signatures === undefined) return true
      return !signatures.has(this.ownID)
    })
  }

  async signUnsigned (): Promise<Response[]> {
    if (!this.isMember()) throw new Error('Not a member of the group')
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
