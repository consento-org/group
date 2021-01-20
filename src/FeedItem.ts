export type ResponseType = 'accept' | 'deny' | 'cancel' | 'conflict'
export type ResponseState =
  | 'pending'
  | 'ready'
  | 'cancelled'
  | 'failed'
  | 'finished'
export type Operation = 'add' | 'remove'
export type RequestIdentifier = 'request'
export type ResponseIdentifier = 'response'
export type FeedItem = Request | Response

export type ID = string

export const REQUEST_TYPE = 'request' as RequestIdentifier
export const RESPONSE_TYPE = 'response' as ResponseIdentifier

export interface Request {
  // Used to differentiate between req/res
  type: RequestIdentifier
  // ID of the request
  id: ID
  // ID of the creator
  from: ID
  // What sort of operation this is
  operation: Operation

  // When this event occured
  timestamp: Timestamp

  // Who to add or remove
  who: ID
}

export interface Response {
  // Used to differentiate between req/res
  type: ResponseIdentifier
  // ID of the request
  id: ID
  // ID of the request creator
  from: ID
  // Our response to this request
  response: ResponseType

  // When this event occured
  timestamp: Timestamp
}

export function isRequest (item: FeedItem): item is Request {
  return item.type === REQUEST_TYPE
}

export function isResponse (item: FeedItem): item is Response {
  return item.type === RESPONSE_TYPE
}
