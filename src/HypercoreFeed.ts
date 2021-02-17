import { Feed } from './Feed'
import { Hypercore } from 'hyper-sdk'
import { FeedItem } from './FeedItem'
import HLC from '@consento/hlc'

export class HypercoreFeed extends Feed {
  feed: Hypercore<FeedItem>

  constructor (feed: Hypercore<FeedItem>) {
    const key: string = feed.key.toString('hex')
    const url = `hyper://${key}`

    super(url)
    this.feed = feed
  }

  // We don't have access to other peers' feed instance typically.
  async sync (): Promise<boolean> {
    // Download everything we don't already have
    await this.feed.download()

    // Not sure if this return is even useful...
    return true
  }

  get length (): number {
    return this.feed.length
  }

  async get (index: number): Promise<FeedItem> {
    const got = await this.feed.get(index)
    // TODO: Shouldn't need to JSON stringify this. 😅
    got.timestamp = new HLC.Timestamp(
      got.timestamp.wallTime,
      got.timestamp.logical
    )

    return got
  }

  async append (item: FeedItem): Promise<number> {
    await this.feed.append(item)
    return this.length
  }
}
