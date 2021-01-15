import test from 'fresh-tape'
import { randomBytes } from 'crypto'
import { Permissions } from '../src/Permissions'
import { Operation, Request, ID } from '../src/member'
import HLC from '@consento/hlc'

const memberA = 'a'
const memberB = 'b'
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

test('First initialization', t => {
  const p = new Permissions()
  p.add(request({ operation: 'add', who: memberA, from: memberA }))
  t.deepEquals(p.members.byState.added, new Set(memberA))
  t.end()
})

test('First member can not add a second member', t => {
  const p = new Permissions()
  t.throws(() => p.add(request({ operation: 'add', who: memberA, from: memberB })))
  t.end()
})
