import test from 'fresh-tape'
import { randomBytes } from 'crypto'
import { Permissions } from '../src/Permissions'
import { Operation, Request, ID, Response, ResponseType } from '../src/member'
import HLC from '@consento/hlc'

const memberA = 'a'
const memberB = 'b'
const memberC = 'c'
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
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
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
  t.end()
})
