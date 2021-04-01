import { Buffer } from 'buffer'
import HLC, { Timestamp } from '@consento/hlc'

import { FeedItem as FeedItemCodec } from './Protobufs'

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

const ResponseMap: ResponseType[] = [
  'accept', 'deny', 'cancel', 'conflict'
]

const {
  FeedItemType: FeedItemTypeCodec,
  RequestOperation: RequestOperationCodec,
  ResponseType: ResponseTypeCodec
} = FeedItemCodec

type ResponseTypeValues = typeof ResponseTypeCodec.ACCEPT | typeof ResponseTypeCodec.DENY | typeof ResponseTypeCodec.CANCEL | typeof ResponseTypeCodec.CONFLICT

export interface Request {
  // Used to differentiate between req/res
  type: RequestIdentifier
  // ID of the request
  id: ID
  // ID of the creator
  from: ID

  // When this event occured
  timestamp: Timestamp

  // What sort of operation this is
  operation: Operation

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
  // When this event occured
  timestamp: Timestamp

  // Our response to this request
  response: ResponseType
}

export function isRequest (item: FeedItem): item is Request {
  return item.type === REQUEST_TYPE
}

export function isResponse (item: FeedItem): item is Response {
  return item.type === RESPONSE_TYPE
}

export function decode (buffer: Buffer): FeedItem {
  const decoded = FeedItemCodec.decode(buffer)
  const { from, id, timestamp: _timestamp } = decoded

  if (from === undefined) throw new TypeError('Missing from field in decoded buffer')
  if (id === undefined) throw new TypeError('Missing id field in decoded buffer')
  if (_timestamp === undefined) throw new TypeError('Missing timestamp field in decoded buffer')

  const timestamp = HLC.codec.decode(_timestamp)

  if (decoded.type === FeedItemTypeCodec.REQUEST) {
    if (decoded.who === undefined) throw new TypeError('Missing who field in decoded buffer')
    if (decoded.operation === undefined) throw new TypeError('Missing operation field in decoded buffer')

    const who = decoded.who
    const isAdd = decoded.operation === RequestOperationCodec.ADD
    const operation = isAdd ? 'add' : 'remove'

    return {
      type: 'request',
      from,
      id,
      timestamp,
      operation,
      who
    }
  } else {
    if (decoded.response === undefined) throw new TypeError('Missing response field in decoded buffer')

    const response = ResponseMap[decoded.response]
    return {
      type: 'response',
      from,
      id,
      timestamp,
      response
    }
  }
}

export function encode (item: FeedItem): Buffer {
  const { id, from, timestamp: _timestamp } = item

  const timestamp = Buffer.from(HLC.codec.encode(_timestamp))

  if (isRequest(item)) {
    const { operation: _operation, who } = item
    const operation = RequestOperationCodec[_operation.toUpperCase()]

    return FeedItemCodec.encode({
      type: FeedItemTypeCodec.REQUEST,
      id,
      from,
      timestamp,
      who,
      operation
    })
  } else if (isResponse(item)) {
    const { response: _response } = item
    let response: ResponseTypeValues = ResponseTypeCodec.CONFLICT
    switch (_response) {
      case 'accept':
        response = ResponseTypeCodec.ACCEPT
        break
      case 'deny':
        response = ResponseTypeCodec.DENY
        break
      case 'cancel':
        response = ResponseTypeCodec.CANCEL
        break
      case 'conflict':
        response = ResponseTypeCodec.CONFLICT
        break
      default: throw new TypeError(`Invalid response value ${_response}`)
    }

    return FeedItemCodec.encode({
      type: FeedItemTypeCodec.RESPONSE,
      id,
      from,
      timestamp,
      response
    })
  }
}
