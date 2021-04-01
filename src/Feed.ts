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
import { Sync } from './Sync'

import { Header, def } from './Protobufs'

export type FeedLoader = (id: ID) => Promise<Feed>

export async function defaultFeedLoader (id: ID): Promise<Feed> {
  return new Feed(id)
}

export type Metadata = def.Header_Metadata

export class Feed {
  readonly items = new Array<FeedItem|Buffer>()
  id: ID
  index: number

  constructor (id: ID) {
    this.id = id
    this.index = 0
  }

  async getMetadata (): Promise<Metadata | undefined> {
    if (this.length === 0) throw new Error('No Metadata Present')
    const buffer = await this.getRaw(0)
    const parsed = Header.decode(buffer)

    return parsed.metadata
  }

  async writeMetadata (metadata: Metadata): Promise<void> {
    if (this.length > 0) throw new Error('Can only write metdata to an empty feed')
    const encoded = Header.encode({
      protocol: 'consento',
      metadata
    })

    await this.appendRaw(encoded)
  }

  // Return value of `true` means stuff got synced
  async sync (other: Sync): Promise<boolean> {
    // TODO: detect potential fork in timestamps
    if (!await other.hasFeed(this.id)) return false

    const otherFeed = await other.getFeed(this.id)

    if (otherFeed.length > this.length) {
      this.items.push(...otherFeed.items.slice(this.length))
      return true
    }

    return false
  }

  async current (): Promise<FeedItem> {
    return await this.get(this.index)
  }

  increment (): void {
    this.index++
  }

  async get (index: number): Promise<FeedItem> {
    return this.items[index] as FeedItem
  }

  async append (item: FeedItem): Promise<number> {
    this.items.push(item)
    return this.items.length
  }

  async appendRaw (data: Buffer): Promise<number> {
    this.items.push(data)
    return this.items.length
  }

  async getRaw (index: number): Promise<Buffer> {
    return this.items[index] as Buffer
  }

  hasMore (): boolean {
    return this.length > 0 && (this.index < this.length)
  }

  get length (): number {
    return this.items.length
  }

  async addRequest ({
    operation,
    who,
    timestamp
  }: {
    operation: Operation
    who: ID
    timestamp: Timestamp
  }): Promise<Request> {
    const req: Request = {
      type: 'request',
      // TODO: Use more bytes?
      id: randomBytes(5).toString('hex'),
      from: this.id,
      timestamp,
      operation,
      who
    }
    await this.append(req)
    return req
  }

  async addResponse ({
    id,
    response,
    timestamp
  }: {
    id: ID
    response: ResponseType
    timestamp: Timestamp
  }): Promise<Response> {
    const res: Response = {
      type: 'response',
      id,
      from: this.id,
      timestamp,
      response
    }
    await this.append(res)
    return res
  }

  async close (): Promise<void> {
    // Nothing to do here
  }
}
