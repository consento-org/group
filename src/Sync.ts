import { Permissions } from './Permissions'
import {
  ID,
  FeedItem,
  Operation,
  ResponseType,
  Request,
  Response
} from './FeedItem'
import { randomBytes } from 'crypto'
import { Timestamp } from '@consento/hlc'

export class Feed {
  readonly items = new Array<FeedItem>()
  id: ID
  index: number

  constructor (id: ID) {
    this.id = id
    this.index = 0
  }

  // Return value of `true` means stuff got synced
  sync (other: Feed): boolean {
    // TODO: detect potential fork in timestamps
    if (other.length > this.length) {
      this.items.push(...other.items.slice(this.length))
    }

    return false
  }

  current (): FeedItem {
    return this.items[this.index]
  }

  increment (): void {
    this.index++
  }

  hasMore (): boolean {
    return this.length > 0 && (this.index < this.length)
  }

  get length (): number {
    return this.items.length
  }

  addRequest ({
    operation,
    who,
    timestamp
  }: {
    operation: Operation
    who: ID
    timestamp: Timestamp
  }): Request {
    const req: Request = {
      type: 'request',
      // TODO: Use more bytes?
      id: randomBytes(5).toString(),
      from: this.id,
      timestamp,
      operation,
      who
    }
    this.items.push(req)
    return req
  }

  addResponse ({
    id,
    response,
    timestamp
  }: {
    id: ID
    response: ResponseType
    timestamp: Timestamp
  }): Response {
    const res: Response = {
      type: 'response',
      id,
      from: this.id,
      timestamp,
      response
    }
    this.items.push(res)
    return res
  }
}

export class Sync {
  readonly permissions = new Permissions()
  readonly knownFeeds = new Map<ID, Feed>()

  // Return value of `true` means stuff got synced
  sync (other: Sync): boolean {
    let hasSynced: boolean = false
    for (const remoteFeed of other.allFeeds) {
      const localFeed = this.getFeed(remoteFeed.id)
      const feedSynced = localFeed.sync(remoteFeed)
      hasSynced = feedSynced || hasSynced
    }

    this.processFeeds()

    return hasSynced
  }

  processFeeds (): boolean {
    let hasProcessed = false
    for (const id of this.permissions.currentMembers) {
      try {
        const feed = this.getFeed(id)
        if (!feed.hasMore()) continue
        const item = feed.current()
        this.permissions.add(item)
        hasProcessed = true
        feed.increment()
      } catch (e) {
        if (String(e.message).startsWith('Response for unknown request')) {
        // It's fiiine, we'll deal with it later
        } else {
        // TODO: Should we handle errors in a better way?
          throw e
        }
      }
    }

    if (hasProcessed) {
      // If we processed some new data, we should try to process the feeds again
      this.processFeeds()
    }

    return hasProcessed
  }

  getFeed (who: ID): Feed {
    if (!this.knownFeeds.has(who)) {
      this.addFeed(new Feed(who))
    }

    return this.knownFeeds.get(who) as Feed
  }

  addFeed (feed: Feed): void {
    this.knownFeeds.set(feed.id, feed)
  }

  get allFeeds (): Feed[] {
    return [...this.knownFeeds.values()]
  }
}
