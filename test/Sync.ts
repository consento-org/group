import test from './testPromise'
import { Sync } from '../src/Sync'
import { Feed } from '../src/Feed'
import HLC from '@consento/hlc'

test('Able to sync a single feed', async (t) => {
  const clock = new HLC()
  const feed = new Feed('a')
  await feed.addRequest({
    operation: 'add',
    who: 'a',
    timestamp: clock.now()
  })

  const sync = new Sync('a')

  t.pass('Able to create')

  await sync.addFeed(feed)

  t.pass('Able to add feed')

  await sync.processFeeds()

  t.pass('Able to process feed')
})
