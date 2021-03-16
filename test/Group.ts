import test from './testPromise'
import delay from 'delay'

import { Group, GroupOptions } from '../src/Group'
import { ID } from '../src/FeedItem'

const EXAMPLE_ID = `hyper://${new Array(64).fill('a').join('')}`

export type CreateGroup = (options? : GroupOptions) => Promise<Group>

export default function (GroupType: typeof Group, label: string = 'Group'): void {
  test(`${label}: Able to initialize a member`, async (t) => {
    const member = await createGroup()
    try {
      t.pass('Able to process feeds with zero data')
      t.equal((await member.feed.get(0)).type, 'request', 'auto-generated request')
      t.ok(member.isInitiator, 'became initiator')
      t.deepEqual(member.members, [member.ownID], 'is initial known member')
    } finally {
      await member.close()
    }
  })

  test(`${label}: Able to add a member by ID`, async (t) => {
    const member = await createGroup()
    try {
      const req = await member.requestAdd(EXAMPLE_ID)

      t.ok(req, 'Generated a request')

      t.deepEqual(await member.feed.get(1), req, 'rquest saved to feed')

      const pending = member.getActiveRequests()

      t.deepEqual(pending, [], 'No pending requests')

      const expectedGroups = [member.ownID, EXAMPLE_ID]

      t.deepEqual(
        member.members,
        expectedGroups,
        'New member got added to list'
      )
    } finally {
      await member.close()
    }
  })

  test(`${label}: Able to add a member by ID and sync`, async (t) => {
    const member = await createGroup()
    const other = await createGroup({ initiator: member.id })
    try {
      await other.createOwnFeed()

      const req = await member.requestAdd(other.ownID)

      t.ok(req, 'Generated a request')

      await other.sync(member)

      t.pass('Able to sync with member')

      t.equal(member.id, other.id, 'Initiator got set correctly')

      const expectedGroups = [member.ownID, other.ownID]

      t.deepEqual(
        other.members,
        expectedGroups,
        'Group saw itself added to list'
      )

      t.deepEqual(
        member.members,
        other.members,
        'Groups converged on same list'
      )
    } finally {
      await member.close()
      await other.close()
    }
  })

  test(`${label}: Happy path of adding several members together`, async (t) => {
    const [a, b, c, d, e, f] = await initializeGroups(6, { knowEachOther: false })

    try {
      const currentGroups = [a]

      await authorizeGroup(b)
      await authorizeGroup(c)
      await authorizeGroup(d)
      await authorizeGroup(e)

      await sync(f, c)

      t.deepEqual(f.members, c.members, 'Outside member resovled to same ID')

      function currentIDs (): ID[] {
        return currentGroups.map(({ ownID }) => ownID)
      }

      async function authorizeGroup (member: Group, initiator?: Group): Promise<void> {
        initiator = initiator ?? currentGroups[currentGroups.length - 1]
        const others = currentGroups.filter(other => other !== initiator)

        await initiator.requestAdd(member.ownID)
        t.pass(`${initiator.ownID} requested add for ${member.ownID}`)

        // Give some time for the network to update
        await delay(200)

        let previous = initiator

        if (others.length === 0) {
          const unsigned = initiator.getUnsignedRequests()

          t.equal(unsigned.length, 0, `${initiator.ownID} doesn't see unsigned request ${member.ownID}`)
        } else {
          for (const next of others) {
            t.pass(`sync ${previous.ownID} -> ${next.ownID}`)
            await sync(previous, next)

            const unsigned = next.getUnsignedRequests()

            t.equal(unsigned.length, 1, `${next.ownID} sees unsigned request ${member.ownID}`)

            const signed = await next.signUnsigned()

            t.equal(signed.length, 1, `${next.ownID} signed active request ${member.ownID}`)

            // Give some time for the network to update
            await delay(200)
            previous = next
          }
        }

        const exists = previous.members.includes(member.ownID)

        t.ok(exists, `Member ${member.ownID} got added`)

        currentGroups.push(member)

        const ids = currentIDs()

        for (const next of currentGroups) {
          await sync(next, previous)

          t.deepEquals(next.members, ids, `${next.ownID} resolved expected members`)
        }
      }
    } finally {
      await Promise.all(
        [a, b, c, d, e, f].map(async (m) => await m.close())
      )
    }
  })

  test(`${label}: Able to initialize a bunch of members`, async (t) => {
    const members = await initializeGroups(5, { knowEachOther: true })
    try {
      const memberIds = members.map(({ ownID }) => ownID)

      for (const member of members) {
        t.deepEqual(member.members, memberIds, `${member.ownID} sees all members`)
      }
    } finally {
      await Promise.all(members.map(async (m) => await m.close()))
    }
  })

  test(`${label}: Process request by syncing one peer at a time`, async (t) => {
    const members = await initializeGroups(5, { knowEachOther: true })
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

      const wasAdded = previous.members.includes(EXAMPLE_ID)
      t.ok(wasAdded, 'Request got processed successfully')
    } finally {
      await Promise.all(members.map(async (m) => await m.close()))
    }
  })

  test(`${label}: Only two members remove each other`, async (t) => {
    const [a, b] = await initializeGroups(2, { knowEachOther: true })
    try {
      await a.requestRemove(b.ownID)
      await b.requestRemove(a.ownID)

      await delay(200)

      await sync(a, b)

      t.equals((await b.signUnsigned()).length, 1, 'B required to remove B')
      t.equals((await a.signUnsigned()).length, 1, 'A required to remove A')

      await delay(200)

      t.equals(b.members.length, 1, 'B removed on B')

      await sync(b, a)

      t.equals(a.members.length, 0, 'B removed on A')
      t.equals(b.members.length, 0, 'A removed on B')

      t.equals(a.getUnsignedRequests().length, 0, 'No request should be active anymore on A as it was removed on B')
    } finally {
      await Promise.all(
        [a, b].map(async (m) => await m.close())
      )
    }
  })

  test(`${label}: Multiple requests get treated one at a time`, async (t) => {
    const [a, b] = await initializeGroups(2, { knowEachOther: true })

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
    const [a, b, c, d, e] = await initializeGroups(5, { knowEachOther: true })

    const f = await createGroup({ id: 'f', initiator: a.id })
    const g = await createGroup({ id: 'g', initiator: a.id })
    try {
    // F and G should see all known members thus far
      await sync(a, f)
      await sync(a, g)

      await a.requestAdd(f.ownID)

      await d.requestAdd(g.ownID)

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

      const wasAddedA = c.members.includes(f.ownID)

      const wasAddedD = c.members.includes(g.ownID)

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
    const [a, b, c] = await initializeGroups(3, { knowEachOther: true })
    await delay(200)
    // Set up two external peers
    const d = await createGroup({ id: 'd', initiator: a.ownID })
    const e = await createGroup({ id: 'e', initiator: a.ownID })

    try {
      // Have them sync the initial members
      await sync(a, d)
      await sync(a, e)

      await a.requestAdd(d.ownID)
      await c.requestAdd(e.ownID)
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

      t.ok(c.members.includes(d.ownID), 'C sees member D')

      await sync(b, a)

      t.equal(a.getActiveRequests().length, 2, 'A has pending requests A and C')

      t.equal((await a.signUnsigned()).length, 1, 'A accepted request C')
      await delay(200)

      t.equal(a.getActiveRequests().length, 1, 'A has one pending request A')

      t.ok(a.members.includes(e.ownID), 'A sees member E')

      await sync(a, c)

      t.deepEqual(a.getActiveRequests(), [], 'A has no pending requests')
      t.deepEqual(c.getActiveRequests(), [], 'C has no pending requests')

      t.deepEqual(a.members, c.members, 'A and C converge on same set of peers')

      await sync(a, d)

      t.deepEqual(a.members, d.members, 'A and D converge on same set of peers')

      await sync(c, e)

      t.deepEqual(c.members, e.members, 'C and E converge on same set of peers')

      t.deepEqual(d.members, e.members, 'D and E converge on same set of peers')
    } finally {
      await Promise.all(
        [a, b, c, d, e].map(async (m) => await m.close())
      )
    }
  })

  async function sync (member1: Group, member2: Group): Promise<void> {
    await member1.sync(member2)
    await member2.sync(member1)
  }

  async function createGroup ({ id, initiator }: {id?: ID, initiator?: ID} = {}): Promise<Group> {
    if (initiator !== undefined) {
      const group = await GroupType.load({ id: initiator })
      if (id !== undefined) await group.createOwnFeed(id)
      return group
    } else {
      return await GroupType.create({ id })
    }
  }

  async function initializeGroups (n: number, { knowEachOther }: { knowEachOther: boolean }): Promise<Group[]> {
    const members: Group[] = []
    if (n === 0) {
      return []
    }
    const initiator = await createGroup({ id: 'a' })

    while (n-- > 1) {
      const member = await createGroup({
        initiator: initiator.ownID
      })
      await member.createOwnFeed(String.fromCharCode(0x61 + n))
      members.unshift(member)
    }

    members.unshift(initiator)

    if (knowEachOther) {
      const toAdd = members.slice(1)

      const currentGroups: Group[] = []

      const authorizeGroup = async (member: Group): Promise<void> => {
        const others = currentGroups.filter(other => other !== initiator)

        await initiator.requestAdd(member.ownID)

        await delay(100)

        if (others.length !== 0) {
          for (const next of others) {
            await sync(initiator, next)

            await next.signUnsigned()

            await delay(100)

            await sync(initiator, next)
          }
        }

        currentGroups.push(member)

        for (const next of others) {
          await sync(initiator, next)
        }
      }

      for (const member of toAdd) {
        await authorizeGroup(member)
      }
    }

    for (const next of members) {
      await sync(initiator, next)
    }

    return members
  }
}
