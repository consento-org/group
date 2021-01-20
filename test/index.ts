import test from 'fresh-tape'

import { Member } from '../src/member'

const EXAMPLE_ID = 'example'

test('Able to initialize a member', (t) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const member = new Member()

  t.pass('Able to process feeds with zero data')

  t.end()
})

test('Able to add a member by ID', (t) => {
  const member = new Member()

  const req = member.requestAdd(EXAMPLE_ID)

  t.ok(req, 'Generated a request')

  t.equal(member.ownFeed[1].type, 'response', 'auto-generated response')

  member.processFeeds()

  t.pass('Processed feeds')

  const expectedMembers = [member.id, EXAMPLE_ID]
  t.deepEqual(
    member.knownMembers,
    expectedMembers,
    'New member got added to list'
  )

  t.end()
})

test('Able to add a member by ID and sync', (t) => {
  const member = new Member()
  const other = new Member({ initiator: member.id })

  const req = member.requestAdd(other.id)

  t.ok(req, 'Generated a request')

  const res = member.acceptRequest(req)

  t.ok(res, 'Generated response')

  member.processFeeds()

  other.sync(member)

  t.pass('Able to sync with member')

  other.processFeeds()

  t.pass('Able to process feeds after sync')

  const expectedMembers = [member.id, other.id]
  t.deepEqual(
    other.knownMembers,
    expectedMembers,
    'New member saw itself added to list'
  )

  t.end()
})

test('Happy path of adding several members together', (t) => {
  const [a, b, c, d, e] = initializeMembers(5, { knowEachOther: false })

  const currentMembers = [a]

  authorizeMember(b)
  authorizeMember(c)
  authorizeMember(d)
  authorizeMember(e)

  const f = new Member({ id: 'f', initiator: 'a' })

  sync(f, c)

  t.deepEqual(f.knownMembers, c.knownMembers, 'Outside member resovled to same ID')

  t.end()

  function authorizeMember (member: Member, initiator?: Member): void {
    initiator = initiator ?? currentMembers[currentMembers.length - 1]
    const others = currentMembers.filter(other => other !== initiator)

    initiator.requestAdd(member.id)

    let previous = initiator

    if (others.length === 0) {
      const unsigned = initiator.getUnsignedRequests()

      t.equal(unsigned.length, 0, `${initiator.id} doesn't see unsigned request ${member.id}`)
    } else {
      for (const next of others) {
        t.pass(`sync ${previous.id} -> ${next.id}`)
        sync(previous, next)

        const unsigned = next.getUnsignedRequests()

        t.equal(unsigned.length, 1, `${next.id} sees unsigned request ${member.id}`)

        const signed = next.signUnsigned()

        t.equal(signed.length, 1, `${next.id} signed active request ${member.id}`)

        previous = next
      }
    }

    const exists = previous.knownMembers.includes(member.id)

    t.ok(exists, `Member ${member.id} got added`)

    currentMembers.push(member)

    for (const next of currentMembers) {
      sync(next, previous)

      t.deepEquals(next.knownMembers, previous.knownMembers, `${next.id} resolved expected members`)
    }
  }
})

test('Able to initialize a bunch of members', (t) => {
  const members = initializeMembers(5, { knowEachOther: true })

  const knownMembers = members.map(({ id }) => id)

  for (const member of members) {
    t.deepEqual(member.knownMembers, knownMembers, `${member.id} sees all members`)
  }

  t.end()
})

test('Process request by syncing one peer at a time', (t) => {
  const members = initializeMembers(5, { knowEachOther: true })

  let previous = members[0]
  previous.requestAdd(EXAMPLE_ID)
  previous.processFeeds()

  for (const next of members.slice(1)) {
    sync(previous, next)
    next.signUnsigned()
    sync(previous, next)
    previous = next
  }

  const wasAdded = previous.knownMembers.includes(EXAMPLE_ID)
  t.ok(wasAdded, 'Request got processed successfully')

  t.end()
})

test('Only two members remove each other', t => {
  const [a, b] = initializeMembers(2, { knowEachOther: true })

  a.requestRemove(b.id)
  b.requestRemove(a.id)

  sync(a, b)

  t.equals(b.signUnsigned().length, 1, 'B required to remove B')
  t.equals(a.signUnsigned().length, 1, 'A required to remove A')

  t.equals(b.knownMembers.length, 1, 'B removed on B')

  sync(b, a)
  t.equals(a.knownMembers.length, 0, 'B removed on A')
  t.equals(b.knownMembers.length, 0, 'A removed on B')

  t.equals(a.getUnsignedRequests().length, 0, 'No request should be active anymore on A as it was removed on B')
  t.end()
})

test('Multiple requests get treated one at a time', t => {
  const [a, b] = initializeMembers(3, { knowEachOther: true })

  const e = new Member()
  const f = new Member()
  const g = new Member()

  const r1 = a.requestAdd(e.id)
  const r2 = a.requestAdd(f.id)
  const r3 = b.requestAdd(g.id)

  sync(a, b)

  t.deepEquals(a.getUnsignedRequests().map(r => r.req), [r3], 'The request by `b` (r3) is not yet signed by `a`')
  t.deepEquals(b.getUnsignedRequests().map(r => r.req), [r1], 'The request by `a` (r1) is not yet signed by `b`')
  t.deepEquals(a.getActiveRequests().map(r => r.req), [r1, r3], 'Each members gets to have one request, `r1` for `a` and `r2` for `b`')
  t.deepEquals(a.getPendingRequests().map(r => r.req), [r1, r2, r3], 'All Requests are listed.')

  t.end()
})

test('Two members do an add at once', (t) => {
  const [a, b, c, d, e] = initializeMembers(5, { knowEachOther: true })

  const f = new Member()
  const g = new Member()

  // F and G should see all known members thus far
  sync(a, f)
  sync(a, g)

  a.requestAdd(f.id)

  d.requestAdd(g.id)

  sync(a, b)

  t.equal(b.signUnsigned().length, 1, 'B accepted Request A')

  sync(d, e)

  t.equal(e.signUnsigned().length, 1, 'E accepted Request D')

  sync(e, c)
  sync(b, c)

  const unsigned = c.getUnsignedRequests()

  t.equal(unsigned.length, 2, 'C sees 2 active requests')

  sync(c, b)

  t.equal(b.signUnsigned().length, 1, 'B accepted Request D')

  sync(c, e)

  t.equal(e.signUnsigned().length, 1, 'E accepted Request A')

  sync(e, d)

  t.equal(d.signUnsigned().length, 1, 'D accepted Request A')

  sync(b, a)

  t.equal(a.signUnsigned().length, 1, 'A accepted request D')

  sync(a, c)
  sync(d, c)

  const ready = c.getUnsignedRequests()

  t.equal(ready.length, 2, 'C sees 2 ready-active requests')

  c.signUnsigned()

  const wasAddedA = c.knownMembers.includes(f.id)

  const wasAddedD = c.knownMembers.includes(g.id)

  t.ok(wasAddedA, 'F was added via A')
  t.ok(wasAddedD, 'G was added via D')

  t.end()
})

test('Concurrent requests should resolve to the same state on all members', (t) => {
  const [a, b, c] = initializeMembers(3, { knowEachOther: true })

  // Set up two external peers
  const d = new Member({ id: 'd', initiator: a.id })
  const e = new Member({ id: 'e', initiator: a.id })

  // Have them sync the initial knownMembers
  sync(a, d)
  sync(a, e)

  a.requestAdd(d.id)
  c.requestAdd(e.id)

  t.equal(a.getActiveRequests().length, 1, 'A has one pending request')
  t.equal(c.getActiveRequests().length, 1, 'C has one pending request')

  sync(a, b)

  t.equal(b.getActiveRequests().length, 1, 'B has one pending request A')

  t.equal(b.signUnsigned().length, 1, 'B accepted request A')

  sync(c, b)

  t.equal(b.getActiveRequests().length, 2, 'B has pending requests A and C')

  t.equal(b.signUnsigned().length, 1, 'B accepted request C')

  t.equal(c.getActiveRequests().length, 2, 'C has pending requests A and C')

  t.equal(c.signUnsigned().length, 1, 'C accepted request A')

  t.equal(c.getActiveRequests().length, 1, 'C has one pending request C')

  t.ok(c.knownMembers.includes(d.id), 'C sees member D')

  sync(b, a)

  t.equal(a.getActiveRequests().length, 2, 'A has pending requests A and C')

  t.equal(a.signUnsigned().length, 1, 'A accepted request C')

  t.equal(a.getActiveRequests().length, 1, 'A has one pending request A')

  t.ok(a.knownMembers.includes(e.id), 'A sees member E')

  sync(a, c)

  t.deepEqual(a.getActiveRequests(), [], 'A has no pending requests')
  t.deepEqual(c.getActiveRequests(), [], 'C has no pending requests')

  t.deepEqual(a.knownMembers, c.knownMembers, 'A and C converge on same set of peers')

  sync(a, d)

  t.deepEqual(a.knownMembers, d.knownMembers, 'A and D converge on same set of peers')

  sync(c, e)

  t.deepEqual(c.knownMembers, e.knownMembers, 'C and E converge on same set of peers')

  t.deepEqual(d.knownMembers, e.knownMembers, 'D and E converge on same set of peers')

  t.end()
})

function sync (member1: Member, member2: Member): void {
  member1.sync(member2)
  member2.sync(member1)
}

function initializeMembers (n: number, { knowEachOther }: { knowEachOther: boolean }): Member[] {
  const members: Member[] = []
  if (n === 0) {
    return []
  }
  const initiator = new Member({ id: 'a' })

  while (n-- > 1) {
    const member = new Member({
      id: String.fromCharCode(0x61 + n),
      initiator: initiator.id
    })
    members.unshift(member)
  }

  members.unshift(initiator)

  if (knowEachOther) {
    const toAdd = members.slice(1)

    const currentMembers: Member[] = []

    const authorizeMember = (member: Member): void => {
      const others = currentMembers.filter(other => other !== initiator)

      initiator.requestAdd(member.id)

      if (others.length !== 0) {
        for (const next of others) {
          sync(initiator, next)

          next.signUnsigned()

          sync(initiator, next)
        }
      }

      currentMembers.push(member)

      for (const next of others) {
        sync(initiator, next)
      }
    }

    for (const member of toAdd) {
      authorizeMember(member)
    }
  }

  for (const next of members) {
    sync(initiator, next)
  }

  return members
}
