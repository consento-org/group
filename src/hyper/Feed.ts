import { Feed } from '../Feed'
import { Hypercore } from 'hyper-sdk'
import { FeedItem } from '../FeedItem'
import HLC from '@consento/hlc'
import { Sync } from '../Sync'

const PEER_CONNECT_DELAY = 3000

export class HypercoreFeed extends Feed {
  feed: Hypercore<FeedItem>

  constructor (feed: Hypercore<FeedItem>) {
    const key: string = feed.key.toString('hex')
    const url = `hyper://${key}`

    super(url)
    this.feed = feed
  }

  // We don't have access to other peers' feed instance typically.
  async sync (other: Sync): Promise<boolean> {
    // If we're a writer, we must already have the data so whatever
    if (this.feed.writable) return false

    if (this.feed.peers.length === 0) {
      await Promise.race([
        new Promise((resolve) => {
          this.feed.once('peer-open', resolve)
        }),
        new Promise((resolve, reject) => {
          setTimeout(() => {
            reject(new Error('Timed out waiting for peers'))
          }, PEER_CONNECT_DELAY)
        })
      ])
    }

    try {
      await this.feed.update({ ifAvailable: true })
    } catch (e) {
      const noUpdate = e.message.includes('No update available from peers') as boolean
      if (!noUpdate) {
        throw e
      }
      // If we don't have updates, there's nothing to sync!
      return false
    }

    if (this.length === 0) {
      return false
    }

    // Download everything we don't already have
    await this.feed.download({ start: 0, end: this.length })

    // Not sure if this return is even useful...
    return true
  }

  get length (): number {
    return this.feed.length
  }

  async get (index: number): Promise<FeedItem> {
    if (this.feed.writable && !this.feed.has(index)) {
      throw new Error(`Index not found: ${index} ${this.id}`)
    }

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

  async close (): Promise<void> {
    await this.feed.close()
    await super.close()
  }
}
