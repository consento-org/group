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
  async sync (other: Feed): Promise<boolean> {
    // TODO: detect potential fork in timestamps
    if (other.length > this.length) {
      this.items.push(...other.items.slice(this.length))
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
    return this.items[index]
  }

  async append (item: FeedItem): Promise<number> {
    this.items.push(item)
    return this.items.length
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
}
