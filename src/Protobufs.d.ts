/* eslint-disable @typescript-eslint/array-type */
/* eslint-disable @typescript-eslint/consistent-type-definitions */
/* eslint-disable @typescript-eslint/naming-convention */
import { Buffer } from 'buffer'
interface Codec <T> {
  buffer: true
  encodingLength: (input: T) => number
  encode: (input: T, buffer?: Buffer, offset?: number) => Buffer
  decode: (input: Buffer, offset?: number, end?: number) => T
}
type Values <T> = T extends { [key: string]: infer U } ? U : never
declare namespace schema {
  namespace def {
    interface Header_Metadata {
      contentFeed?: Buffer
      userData?: Buffer
    }
    interface Header {
      protocol: string
      metadata?: Header_Metadata
    }
    type FeedItem_FeedItemType = {
      REQUEST: 1
      RESPONSE: 2
    }
    type FeedItem_RequestOperation = {
      ADD: 1
      REMOVE: 2
    }
    type FeedItem_ResponseType = {
      ACCEPT: 1
      DENY: 2
      CANCEL: 3
      CONFLICT: 4
    }
    interface FeedItem {
      type?: Values<FeedItem_FeedItemType>
      id?: string
      from?: string
      timestamp?: Buffer
      who?: string
      operation?: Values<FeedItem_RequestOperation>
      response?: Values<FeedItem_ResponseType>
    }
  }
  const Header: Codec<def.Header> & {
    Metadata: Codec<def.Header_Metadata>
  }
  const FeedItem: Codec<def.FeedItem> & {
    FeedItemType: def.FeedItem_FeedItemType
    RequestOperation: def.FeedItem_RequestOperation
    ResponseType: def.FeedItem_ResponseType
  }
}
export = schema
