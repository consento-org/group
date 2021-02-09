import test from 'fresh-tape'
import { Sync, Feed } from '../src/Sync'
import HLC from '@consento/hlc'

test('Able to sync a single feed', (t) => {
  const clock = new HLC()
  const feed = new Feed('a')
  feed.addRequest({
    operation: 'add',
    who: 'a',
    timestamp: clock.now()
  })

  const sync = new Sync()
  sync.addFeed(feed)

  sync.processFeeds()
})
