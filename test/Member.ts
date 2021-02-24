import test from './testPromise'
import delay from 'delay'

import { Member, MemberOptions } from '../src/Member'
import { ID } from '../src/FeedItem'

const EXAMPLE_ID = `hyper://${new Array(64).fill('a').join('')}`

export type CreateMember = (options? : MemberOptions) => Promise<Member>

export default function (createMember: CreateMember, label: string = 'Member'): void {
  test(`${label}: Able to initialize a member`, async (t) => {
    const member = await createMember()
    try {
      t.pass('Able to process feeds with zero data')
      t.equal((await member.feed.get(0)).type, 'request', 'auto-generated request')
      t.ok(member.isInitiator, 'became initiator')
      t.deepEqual(member.knownMembers, [member.id], 'is initial known member')
    } finally {
      await member.close()
    }
  })

  test(`${label}: Able to add a member by ID`, async (t) => {
    const member = await createMember()
    try {
      const req = await member.requestAdd(EXAMPLE_ID)

      t.ok(req, 'Generated a request')

      t.deepEqual(await member.feed.get(1), req, 'rquest saved to feed')

      const pending = member.getActiveRequests()

      t.deepEqual(pending, [], 'No pending requests')

      const expectedMembers = [member.id, EXAMPLE_ID]

      t.deepEqual(
        member.knownMembers,
        expectedMembers,
        'New member got added to list'
      )
    } finally {
      await member.close()
    }
  })

  test(`${label}: Able to add a member by ID and sync`, async (t) => {
    const member = await createMember()
    const other = await createMember({ initiator: member.id })
    try {
      const req = await member.requestAdd(other.id)

      t.ok(req, 'Generated a request')

      await other.sync(member)

      t.pass('Able to sync with member')

      t.equal(member.initiator, other.initiator, 'Initiator got set correctly')

      const expectedMembers = [member.id, other.id]

      t.deepEqual(
        other.knownMembers,
        expectedMembers,
        'Member saw itself added to list'
      )

      t.deepEqual(
        member.knownMembers,
        other.knownMembers,
        'Members converged on same list'
      )
    } finally {
      await member.close()
      await other.close()
    }
  })

  test(`${label}: Happy path of adding several members together`, async (t) => {
    const [a, b, c, d, e, f] = await initializeMembers(6, { knowEachOther: false })

    try {
      const currentMembers = [a]

      await authorizeMember(b)
      await authorizeMember(c)
      await authorizeMember(d)
      await authorizeMember(e)

      await sync(f, c)

      t.deepEqual(f.knownMembers, c.knownMembers, 'Outside member resovled to same ID')

      function currentIDs (): ID[] {
        return currentMembers.map(({ id }) => id)
      }

      async function authorizeMember (member: Member, initiator?: Member): Promise<void> {
        initiator = initiator ?? currentMembers[currentMembers.length - 1]
        const others = currentMembers.filter(other => other !== initiator)

        await initiator.requestAdd(member.id)

        // Give some time for the network to update
        await delay(200)

        let previous = initiator

        if (others.length === 0) {
          const unsigned = initiator.getUnsignedRequests()

          t.equal(unsigned.length, 0, `${initiator.id} doesn't see unsigned request ${member.id}`)
        } else {
          for (const next of others) {
            t.pass(`sync ${previous.id} -> ${next.id}`)
            await sync(previous, next)

            const unsigned = next.getUnsignedRequests()

            t.equal(unsigned.length, 1, `${next.id} sees unsigned request ${member.id}`)

            const signed = await next.signUnsigned()

            t.equal(signed.length, 1, `${next.id} signed active request ${member.id}`)

            // Give some time for the network to update
            await delay(200)
            previous = next
          }
        }

        const exists = previous.knownMembers.includes(member.id)

        t.ok(exists, `Member ${member.id} got added`)

        currentMembers.push(member)

        const ids = currentIDs()

        for (const next of currentMembers) {
          await sync(next, previous)

          t.deepEquals(next.knownMembers, ids, `${next.id} resolved expected members`)
        }
      }
    } finally {
      await Promise.all(
        [a, b, c, d, e, f].map(async (m) => await m.close())
      )
    }
  })

  test(`${label}: Able to initialize a bunch of members`, async (t) => {
    const members = await initializeMembers(5, { knowEachOther: true })
    try {
      const knownMembers = members.map(({ id }) => id)

      for (const member of members) {
        t.deepEqual(member.knownMembers, knownMembers, `${member.id} sees all members`)
      }
    } finally {
      await Promise.all(members.map(async (m) => await m.close()))
    }
  })

  test(`${label}: Process request by syncing one peer at a time`, async (t) => {
    const members = await initializeMembers(5, { knowEachOther: true })
    try {
      let previous = members[0]

      await previous.requestAdd(EXAMPLE_ID)

      await delay(200)

      for (const next of members.slice(1)) {
        await sync(previous, next)
        await next.signUnsigned()

        await delay(200)

        await sync(previous, next)
        previous = next
      }

      const wasAdded = previous.knownMembers.includes(EXAMPLE_ID)
      t.ok(wasAdded, 'Request got processed successfully')
    } finally {
      await Promise.all(members.map(async (m) => await m.close()))
    }
  })

  test(`${label}: Only two members remove each other`, async (t) => {
    const [a, b] = await initializeMembers(2, { knowEachOther: true })
    try {
      await a.requestRemove(b.id)
      await b.requestRemove(a.id)

      await delay(200)

      await sync(a, b)

      t.equals((await b.signUnsigned()).length, 1, 'B required to remove B')
      t.equals((await a.signUnsigned()).length, 1, 'A required to remove A')

      await delay(200)

      t.equals(b.knownMembers.length, 1, 'B removed on B')

      await sync(b, a)

      t.equals(a.knownMembers.length, 0, 'B removed on A')
      t.equals(b.knownMembers.length, 0, 'A removed on B')

      t.equals(a.getUnsignedRequests().length, 0, 'No request should be active anymore on A as it was removed on B')
    } finally {
      await Promise.all(
        [a, b].map(async (m) => await m.close())
      )
    }
  })

  test(`${label}: Multiple requests get treated one at a time`, async (t) => {
    const [a, b] = await initializeMembers(2, { knowEachOther: true })

    try {
      const r1 = await a.requestAdd('e')
      await a.requestAdd('f')
      const r3 = await b.requestAdd('g')

      await delay(200)

      await sync(a, b)

      t.deepEquals(a.getUnsignedRequests(), [r3], 'The request by `b` (r3) is not yet signed by `a`')
      t.deepEquals(b.getUnsignedRequests(), [r1], 'The request by `a` (r1) is not yet signed by `b`')
      t.deepEquals(a.getActiveRequests(), [r1, r3], 'Each members gets to have one request, `r1` for `a` and `r2` for `b`')
    } finally {
      await Promise.all(
        [a, b].map(async (m) => await m.close())
      )
    }
  })

  // This is impractical to pass for now since there's no easy way to avoid replicating everything over hyperswarm
  test.skip(`${label}: Two members do an add at once`, async (t) => {
    const [a, b, c, d, e] = await initializeMembers(5, { knowEachOther: true })

    const f = await createMember({ id: 'f', initiator: a.id })
    const g = await createMember({ id: 'g', initiator: a.id })

    try {
    // F and G should see all known members thus far
      await sync(a, f)
      await sync(a, g)

      await a.requestAdd(f.id)

      await d.requestAdd(g.id)

      await delay(200)

      await sync(a, b)

      t.equal((await b.signUnsigned()).length, 1, 'B accepted Request A')

      await delay(200)

      await sync(d, e)

      t.equal((await e.signUnsigned()).length, 1, 'E accepted Request D')

      await delay(200)

      await sync(e, c)
      await sync(b, c)

      const unsigned = c.getUnsignedRequests()

      t.equal(unsigned.length, 2, 'C sees 2 active requests')

      await sync(c, b)

      t.equal((await b.signUnsigned()).length, 1, 'B accepted Request D')
      await delay(200)

      await sync(c, e)

      t.equal((await e.signUnsigned()).length, 1, 'E accepted Request A')
      await delay(200)

      await sync(e, d)

      t.equal((await d.signUnsigned()).length, 1, 'D accepted Request A')
      await delay(200)

      await sync(b, a)

      t.equal((await a.signUnsigned()).length, 1, 'A accepted request D')
      await delay(200)

      await sync(a, c)
      await sync(d, c)

      const ready = c.getUnsignedRequests()

      t.equal(ready.length, 2, 'C sees 2 ready-active requests')

      await c.signUnsigned()
      await delay(200)

      const wasAddedA = c.knownMembers.includes(f.id)

      const wasAddedD = c.knownMembers.includes(g.id)

      t.ok(wasAddedA, 'F was added via A')
      t.ok(wasAddedD, 'G was added via D')
    } finally {
      await Promise.all(
        [a, b, c, d, e, f, g].map(async (m) => await m.close())
      )
    }
  })

  // This mostly works, but we don't have fine control over sync with hyperswarm
  test.skip(`${label}: Concurrent requests should resolve to the same state on all members`, async (t) => {
    const [a, b, c] = await initializeMembers(3, { knowEachOther: true })
    await delay(200)
    // Set up two external peers
    const d = await createMember({ id: 'd', initiator: a.id })
    const e = await createMember({ id: 'e', initiator: a.id })

    try {
      // Have them sync the initial knownMembers
      await sync(a, d)
      await sync(a, e)

      await a.requestAdd(d.id)
      await c.requestAdd(e.id)
      await delay(200)

      t.equal(a.getActiveRequests().length, 1, 'A has one pending request')
      t.equal(c.getActiveRequests().length, 1, 'C has one pending request')

      await sync(a, b)

      t.equal(b.getActiveRequests().length, 1, 'B has one pending request A')

      t.equal((await b.signUnsigned()).length, 1, 'B accepted request A')
      await delay(200)

      await sync(c, b)

      t.equal(b.getActiveRequests().length, 2, 'B has pending requests A and C')

      t.equal((await b.signUnsigned()).length, 1, 'B accepted request C')
      await delay(200)

      t.equal(c.getActiveRequests().length, 2, 'C has pending requests A and C')

      t.equal((await c.signUnsigned()).length, 1, 'C accepted request A')
      await delay(200)

      t.equal(c.getActiveRequests().length, 1, 'C has one pending request C')

      t.ok(c.knownMembers.includes(d.id), 'C sees member D')

      await sync(b, a)

      t.equal(a.getActiveRequests().length, 2, 'A has pending requests A and C')

      t.equal((await a.signUnsigned()).length, 1, 'A accepted request C')
      await delay(200)

      t.equal(a.getActiveRequests().length, 1, 'A has one pending request A')

      t.ok(a.knownMembers.includes(e.id), 'A sees member E')

      await sync(a, c)

      t.deepEqual(a.getActiveRequests(), [], 'A has no pending requests')
      t.deepEqual(c.getActiveRequests(), [], 'C has no pending requests')

      t.deepEqual(a.knownMembers, c.knownMembers, 'A and C converge on same set of peers')

      await sync(a, d)

      t.deepEqual(a.knownMembers, d.knownMembers, 'A and D converge on same set of peers')

      await sync(c, e)

      t.deepEqual(c.knownMembers, e.knownMembers, 'C and E converge on same set of peers')

      t.deepEqual(d.knownMembers, e.knownMembers, 'D and E converge on same set of peers')
    } finally {
      await Promise.all(
        [a, b, c, d, e].map(async (m) => await m.close())
      )
    }
  })

  async function sync (member1: Member, member2: Member): Promise<void> {
    await member1.sync(member2)
    await member2.sync(member1)
  }

  async function initializeMembers (n: number, { knowEachOther }: { knowEachOther: boolean }): Promise<Member[]> {
    const members: Member[] = []
    if (n === 0) {
      return []
    }
    const initiator = await createMember({ id: 'a' })

    while (n-- > 1) {
      const member = await createMember({
        id: String.fromCharCode(0x61 + n),
        initiator: initiator.id
      })
      members.unshift(member)
    }

    members.unshift(initiator)

    if (knowEachOther) {
      const toAdd = members.slice(1)

      const currentMembers: Member[] = []

      const authorizeMember = async (member: Member): Promise<void> => {
        const others = currentMembers.filter(other => other !== initiator)

        await initiator.requestAdd(member.id)

        await delay(100)

        if (others.length !== 0) {
          for (const next of others) {
            await sync(initiator, next)

            await next.signUnsigned()

            await delay(100)

            await sync(initiator, next)
          }
        }

        currentMembers.push(member)

        for (const next of others) {
          await sync(initiator, next)
        }
      }

      for (const member of toAdd) {
        await authorizeMember(member)
      }
    }

    for (const next of members) {
      await sync(initiator, next)
    }

    return members
  }
}
