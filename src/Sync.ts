import { Permissions } from './Permissions'
import {
  ID
} from './FeedItem'
import { Feed } from './Feed'

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
