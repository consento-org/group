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

test('Process request by syncing one peer at a time', (t) => {
  const members = initializeMembers(5)

  let previous = members[0]
  previous.requestAdd(EXAMPLE_ID)
  previous.processFeeds()

  for (const next of members.slice(1)) {
    sync(previous, next)
    next.acceptPending()
    sync(previous, next)
    previous = next
  }

  const wasAdded = previous.knownMembers.includes(EXAMPLE_ID)
  t.ok(wasAdded, 'Request got processed successfully')

  t.end()
})

test('Two members do an add at once', (t) => {
  const members = initializeMembers(5)

  const [a, b, c, d, e] = members

  const f = new Member()
  const g = new Member()
  f.knownMembers = a.knownMembers.slice()
  g.knownMembers = a.knownMembers.slice()

  a.requestAdd(f.id)

  d.requestAdd(g.id)

  sync(a, b)

  t.equal(b.acceptPending(), 1, 'B accepted Request A')

  sync(d, e)

  t.equal(e.acceptPending(), 1, 'E accepted Request D')

  sync(e, c)
  sync(b, c)

  const pending = c.getPendingRequests()

  t.equal(pending.length, 2, 'C sees 2 pending requests')

  sync(c, b)

  t.equal(b.acceptPending(), 1, 'B accepted Request D')

  sync(c, e)

  t.equal(e.acceptPending(), 1, 'E accepted Request A')

  sync(e, d)

  t.equal(d.acceptPending(), 1, 'D accepted Request A')

  sync(b, a)

  t.equal(a.acceptPending(), 1, 'A accepted request D')

  sync(a, c)
  sync(d, c)

  const ready = c.getPendingRequests()

  t.equal(ready.length, 2, 'C sees 2 pending requests')

  c.acceptPending()

  const wasAddedA = c.knownMembers.includes(f.id)

  const wasAddedD = c.knownMembers.includes(g.id)

  t.notOk(wasAddedA, 'F was not added via A')
  t.ok(wasAddedD, 'G was added via D')

  sync(c, g)

  const finallyPending = g.getPendingRequests()

  t.equal(finallyPending.length, 1, 'G sees 1 pending request')

  t.equal(g.acceptPending(), 1, 'G accepted request A')

  const wasFinallyAddedA = g.knownMembers.includes(f.id)

  t.ok(wasFinallyAddedA, 'F was added via A')

  t.end()
})

test('Happy path of adding several members together', (t) => {
  const a = new Member({ id: 'a'})
  const b = new Member({ id: 'b', initiator: 'a' })
  const c = new Member({ id: 'c', initiator: 'a' })
  const d = new Member({ id: 'd', initiator: 'a' })
  const e = new Member({ id: 'e', initiator: 'a' })

  const currentMembers = [a]

  authorizeMember(b)
  authorizeMember(c)
  authorizeMember(d)
  authorizeMember(e)

  const f = new Member({ id: 'f', initiator: 'a' })

  sync(f, c)

  t.deepEqual(f.knownMembers, c.knownMembers, 'Outside member resovled to same ID')

  t.end()

  function authorizeMember (member: Member): void {
    const initiator = currentMembers[currentMembers.length - 1]
    const others = currentMembers.slice(0, -1)

    initiator.requestAdd(member.id)

    let previous = initiator

    if(!others.length) {
      const pending = initiator.getPendingRequests()

      t.equal(pending.length, 0, `${initiator.id} doesn't see pending request ${member.id}`)
    } else for (const next of others) {
      sync(previous, next)

      const pending = next.getPendingRequests()

      t.equal(pending.length, 1, `${next.id} sees pending request ${member.id}`)

      const accepted = next.acceptPending()

      t.equal(accepted, 1, `${next.id} acepted pending request ${member.id}`)

      previous = next
    }

    const exists = previous.knownMembers.includes(member.id)

    t.ok(exists, 'Member got added')

    currentMembers.push(member)

    for (const next of currentMembers) {
      sync(next, previous)

      t.deepEquals(next.knownMembers, previous.knownMembers, `${next.id} resolved expected members`)
    }
  }
})

function sync (member1: Member, member2: Member): void {
  member1.sync(member2)
  member2.sync(member1)
}

function initializeMembers (n: number): Member[] {
  const members: Member[] = []
  while (n-- > 0) members.push(new Member())

  const knownMembers = members.map(({ id }: Member) => id)
  for (const member of members) {
    member.knownMembers = knownMembers
  }

  return members
}
