import test from 'fresh-tape'
import HLC from '@consento/hlc'

import { MemberList } from '../src/MemberList'

const CLOCK = new HLC()

test('Able add members and see them', (t) => {
  const list = new MemberList()

  list.add('a', CLOCK.now())
  t.pass('able to add')

  t.deepEqual([...list.added()], ['a'], 'Got list')

  t.end()
})

test('Able to remove', (t) => {
  const list = new MemberList()

  list.add('a', CLOCK.now())
  list.add('b', CLOCK.now())
  list.remove('a', CLOCK.now())

  const added = [...list.added()]

  t.deepEqual(added, ['b'], 'Only got seen')

  t.end()
})
