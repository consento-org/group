import { Permissions } from './Permissions'
import {
  ID
} from './FeedItem'
import { Feed, FeedLoader, defaultFeedLoader } from './Feed'

export class Sync {
  readonly permissions = new Permissions()
  readonly knownFeeds = new Map<ID, Feed>()
  readonly initiator: ID
  readonly loadFeed: FeedLoader

  constructor (initiator: ID, loadFeed: FeedLoader = defaultFeedLoader) {
    this.initiator = initiator
    this.loadFeed = loadFeed
  }

  get knownMembers (): ID[] {
    if (this.permissions.isLocked) return []
    const currentMembers = this.permissions.currentMembers
    if (currentMembers.length === 0) return [this.initiator]
    return currentMembers
  }

  // Return value of `true` means stuff got synced
  // TODO: Account for remote Sync which doesn't have actual feeds for the hypercore use case
  async sync (other?: Sync): Promise<boolean> {
    let hasSynced: boolean = false
    let hasMore: boolean = false
    for (const member of this.knownMembers) {
      const localFeed = await this.getFeed(member)
      const feedSynced = await localFeed.sync(other)
      hasSynced = feedSynced || hasSynced
      hasMore = hasMore || localFeed.hasMore()
    }

    if (!hasSynced && !hasMore) {
      return hasSynced
    }

    const hasProcessed = await this.processFeeds()

    if (hasProcessed) await this.sync(other)

    return hasSynced || hasProcessed
  }

  async processFeeds (): Promise<boolean> {
    let hasProcessed = false
    for (const id of this.knownMembers) {
      try {
        const feed = await this.getFeed(id)
        if (!feed.hasMore()) continue
        const item = await feed.current()
        this.permissions.add(item)
        hasProcessed = true
        feed.increment()
      } catch (e) {
        if (String(e.message).startsWith('Response for unknown request')) {
          // console.debug(e)
          // It's fiiine, we'll deal with it later
          // Likely in a feed that hasn't been processed yet
        } else if (String(e.message).endsWith('already has an open request')) {
          // console.debug(e)
          // Probably need to process this request on the next loop
        } else {
        // TODO: Should we handle errors in a better way?
          throw e
        }
      }
    }

    if (hasProcessed) {
      // If we processed some new data, we should try to process the feeds again
      await this.processFeeds()
    }

    return hasProcessed
  }

  async hasFeed (who: ID): Promise<boolean> {
    return this.knownFeeds.has(who)
  }

  async getFeed (who: ID): Promise<Feed> {
    if (!await this.hasFeed(who)) {
      const feed = await this.loadFeed(who)
      await this.addFeed(feed)
    }

    return this.knownFeeds.get(who) as Feed
  }

  async addFeed (feed: Feed): Promise<void> {
    this.knownFeeds.set(feed.id, feed)
  }

  get allFeeds (): Feed[] {
    return [...this.knownFeeds.values()]
  }

  async close (): Promise<void> {
    await Promise.all(
      this.allFeeds.map(
        async (feed) => await feed.close()
      )
    )
  }
}
