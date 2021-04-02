import test from './testPromise'
import HLC from '@consento/hlc'

import {
FeedItem,
 encode,
  decode,
   Request,
    Response,
    isRequest,
    isResponse
     } from '../src/FeedItem'

const CLOCK = new HLC()

test('Encoding and Decoding Requests', async (t) => {
  const rawReq: Request = {
    type: 'request',
    id: 'id here',
    from: 'from here',
    timestamp: CLOCK.now(),
    operation: 'add',
    who: 'you'
  }

  const encoded = encode(rawReq)

  const decoded = decode(encoded)

  if(!isRequest(decoded)) throw new Error('Not a request')

  t.equal(decoded.type, rawReq.type, 'type')
  t.equal(decoded.id, rawReq.id, 'id')
  t.equal(decoded.from, rawReq.from, 'from')
  t.equal(decoded.timestamp.compare(rawReq.timestamp), 0, 'timestamp')
  t.equal(decoded.operation, rawReq.operation, 'operation')
  t.equal(decoded.who, rawReq.who, 'who')
})


test('Encoding and Decoding Responses', async (t) => {
  const rawRes: Response = {
    type: 'response',
    id: 'id here',
    from: 'from here',
    timestamp: CLOCK.now(),
    response: 'accept',
  }

  const encoded = encode(rawRes)

  const decoded = decode(encoded)

  if(!isResponse(decoded)) throw new Error('Not a response')

  t.equal(decoded.type, rawRes.type, 'type')
  t.equal(decoded.id, rawRes.id, 'id')
  t.equal(decoded.from, rawRes.from, 'from')
  t.equal(decoded.timestamp.compare(rawRes.timestamp), 0, 'timestamp')
  t.equal(decoded.response, rawRes.response, 'response')
})
