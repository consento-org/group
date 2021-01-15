import test from 'fresh-tape'
import { randomBytes } from 'crypto'
import { Permissions } from '../src/Permissions'
import { Operation, Request, ID, Response, ResponseType } from '../src/member'
import HLC, { Timestamp } from '@consento/hlc'

const memberA = 'a'
const memberB = 'b'
const memberC = 'c'
const memberD = 'd'
const memberE = 'e'
const hlc = new HLC()

function request (r: Partial<Request> & { operation: Operation, who: ID }): Request {
  return {
    type: 'request',
    id: randomBytes(5).toString(),
    from: memberA,
    timestamp: hlc.now(),
    ...r
  }
}

function response (r: Partial<Response> & { response: ResponseType }): Response {
  return {
    type: 'response',
    from: memberA,
    timestamp: hlc.now(),
    id: randomBytes(5).toString(),
    ...r
  }
}

test('First initialization', t => {
  const p = new Permissions()
  const req = request({ operation: 'add', who: memberA, from: memberA })
  t.equals(p.add(req), req)
  t.deepEquals(p.members.byState.added, new Set(memberA))
  t.end()
})

test('Cant initialize with a remove request', t => {
  const p = new Permissions()
  t.throws(() => p.add(request({ operation: 'remove', who: memberA, from: memberA })), /First request needs to be an add request./)
  t.end()
})

test('First member can not add a second member', t => {
  const p = new Permissions()
  t.throws(() => p.add(request({ operation: 'add', who: memberA, from: memberB })), /The first member can only add itself./)
  t.end()
})

test('A unknown member is prevented from creating requests', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  t.throws(() => p.add(request({ operation: 'add', who: memberB, from: memberB })), /unknown member/)
  t.end()
})

test('The first operation can not be a response', t => {
  const p = new Permissions()
  t.throws(() => p.add(response({ response: 'accept' })), /First feed-item needs to be a request./)
  t.end()
})

test('The first member can add a second member', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  t.deepEquals(p.members.byState.added, new Set([memberA, memberB]))
  t.end()
})

test('One of the first members can not simply add a third member', t => {
  const p = new Permissions()
  const requests = [
    request({ operation: 'add', who: memberA, from: memberA }),
    request({ operation: 'add', who: memberB, from: memberA }),
    request({ operation: 'add', who: memberC, from: memberA })
  ]
  for (const [index, request] of Object.entries(requests)) {
    p.add(request)
    t.equals(p.requests.get(request.id), index < '2' ? 'finished' : 'active')
  }
  t.deepEquals(p.members.byState.added, new Set([memberA, memberB]))
  t.end()
})

test('Requests by member need to be time-ordered', t => {
  const p = new Permissions()
  const time1 = hlc.now()
  const time2 = hlc.now()
  p.add(request({ operation: 'add', who: memberA, from: memberA, timestamp: time2 }))
  t.throws(
    () => p.add(request({ operation: 'add', who: memberA, from: memberA, timestamp: time1 })),
    /Order error: The last item from "a" is newer than this request./
  )
  t.end()
})

test('Request by other member may be older.', t => {
  const p = new Permissions()
  const timeOld = hlc.now()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', who: memberC, from: memberB, timestamp: timeOld }))
  t.end()
})

test('Same request ID cant be used twice', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', id: '1', who: memberA, from: memberA }))
  t.throws(() => p.add(request({ operation: 'add', id: '1', who: memberB, from: memberA })), /Request ID=1 has already been used./)
  t.end()
})

test('The Permission system carries its own clock that is updated with request items', t => {
  const timestamp = new Timestamp({ wallTime: hlc.now().wallTime + 0xfffffffffffn, logical: 0 })
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA, timestamp }))
  t.equals(timestamp.compare(p.clock.now()), -1)
  t.end()
})

test('A member cant respond to a unknown request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  t.throws(() => p.add(response({ response: 'accept', id: 'a', from: memberA })), /Response for unknown request a/)
  t.end()
})

test('A response for a finished request is denied', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', id: 'a', who: memberA, from: memberA }))
  t.throws(() => p.add(response({ response: 'accept', id: 'a', from: memberA })), /Received response to the already-finished request "a"./)
  t.end()
})

test('Multiple requests by a member will turn the later ones to "pending"', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '3', who: memberC, from: memberA }))
  p.add(request({ operation: 'add', id: '4', who: memberD, from: memberA }))
  p.add(request({ operation: 'add', id: '5', who: memberD, from: memberA }))
  t.equals(p.requests.get('3'), 'active')
  t.equals(p.requests.get('4'), 'pending')
  t.equals(p.requests.get('5'), 'pending')
  t.end()
})

test('A member can cancel its own request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '3', who: memberC, from: memberA }))
  p.add(response({ response: 'cancel', id: '3', from: memberA }))
  t.equals(p.requests.get('3'), 'cancelled')
  t.end()
})

test('A member can not cancel someone elses request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '3', who: memberC, from: memberA }))
  t.throws(() => p.add(response({ response: 'cancel', id: '3', from: memberB })), /Member b can not cancel the request 3 by a./)
  t.end()
})

test('A member can deny someone elses request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '3', who: memberC, from: memberA }))
  p.add(response({ response: 'deny', id: '3', from: memberB }))
  t.equals(p.requests.get('3'), 'denied')
  t.end()
})

test('A member can not deny their own request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '3', who: memberC, from: memberA }))
  t.throws(() => p.add(response({ response: 'deny', id: '3', from: memberA })), /Member a can not deny their own request 3. Maybe they meant to cancel?/)
  t.end()
})

test('Can not accept finished request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '1', who: memberC, from: memberA }))
  t.throws(() => p.add(response({ id: '1', response: 'accept', from: memberA })), /Cant accept own request./)
  t.end()
})

test('A member can accept a request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '1', who: memberC, from: memberA }))
  p.add(response({ response: 'accept', id: '1', from: memberB }))
  t.equals(p.requests.get('1'), 'finished')
  t.deepEquals(p.members.byState.added, new Set([memberA, memberB, memberC]))
  t.end()
})

test('Two members need to confirm the add-request', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '1', who: memberC, from: memberA }))
  p.add(response({ response: 'accept', id: '1', from: memberB }))
  p.add(request({ operation: 'add', id: '2', who: memberD, from: memberA }))
  p.add(response({ response: 'accept', id: '2', from: memberB }))
  t.equals(p.requests.get('2'), 'active')
  p.add(response({ response: 'accept', id: '2', from: memberC }))
  t.equals(p.requests.get('2'), 'finished')
  t.deepEquals(p.members.byState.added, new Set([memberA, memberB, memberC, memberD]))
  t.end()
})

test('Previously pending requests need to become active', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', id: '1', who: memberC, from: memberA }))
  p.add(request({ operation: 'add', id: '2', who: memberD, from: memberA }))
  p.add(request({ operation: 'add', id: '3', who: memberE, from: memberA }))
  p.add(response({ response: 'accept', id: '1', from: memberB }))
  t.equals(p.requests.get('2'), 'active')
  t.equals(p.requests.get('3'), 'pending')
  t.end()
})

test('Can only remove added members', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  t.throws(() => p.add(request({ operation: 'remove', who: memberB, from: memberA })), /Cant remove b because it is not a member./)
  t.end()
})

test('Can remove added members', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'remove', id: '1', who: memberB, from: memberA }))
  p.add(response({ response: 'accept', id: '1', from: memberB }))
  t.equals(p.requests.get('1'), 'finished')
  t.deepEquals(p.members.byState.added, new Set([memberA]))
  t.end()
})

test('Can not add already added members', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  t.throws(() => p.add(request({ operation: 'add', who: memberB, from: memberA })), /Cant add b as it is already added/)
  t.end()
})

test('Regularly removing of a member', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'add', who: memberC, id: '1', from: memberA }))
  p.add(response({ id: '1', response: 'accept', from: memberB }))
  p.add(request({ operation: 'remove', who: memberA, id: '2', from: memberB }))
  t.equals(p.requests.get('2'), 'active')
  p.add(response({ id: '2', response: 'accept', from: memberC }))
  t.equals(p.requests.get('2'), 'finished')
  t.equals(p.members.get(memberA), 'removed')
  t.deepEquals(p.members.byState.added, new Set([memberB, memberC]))
  t.end()
})

test('Can not re-add members', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  p.add(request({ operation: 'add', who: memberB, from: memberA }))
  p.add(request({ operation: 'remove', id: '1', who: memberB, from: memberA }))
  p.add(response({ response: 'accept', id: '1', from: memberB }))
  t.throws(() => p.add(request({ operation: 'add', who: memberB, from: memberA })), /Cant add previously removed member b/)
  t.end()
})
