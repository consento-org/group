import { Permissions } from './Permissions'
import {
  ID
} from './FeedItem'
import { Feed } from './Feed'

export class Sync {
  readonly permissions = new Permissions()
  readonly knownFeeds = new Map<ID, Feed>()
  readonly initiator: ID

  constructor (initiator: ID) {
    this.initiator = initiator
  }

  get knownMembers (): ID[] {
    if (this.permissions.isLocked) return []
    const currentMembers = this.permissions.currentMembers
    if (currentMembers.length === 0) return [this.initiator]
    return currentMembers
  }

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
    for (const id of this.knownMembers) {
      try {
        const feed = this.getFeed(id)
        if (!feed.hasMore()) continue
        const item = feed.current()
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
