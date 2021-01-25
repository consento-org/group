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
    return this.get(this.index)
  }

  increment (): void {
    this.index++
  }

  get (index: number): FeedItem {
    return this.items[index]
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
