import SDK, { Hypercore } from 'hyper-sdk'
import HLC from '@consento/hlc'
import test from '../testPromise'

import { HypercoreFeed } from '../../src/hyper/Feed'
import { FeedItem } from '../../src/FeedItem'

const CLOCK = new HLC()

test('Able to create a feed and append to it', async (t) => {
  const { Hypercore, close } = await SDK({ persist: false })
  try {
    const core: Hypercore<FeedItem> = Hypercore<FeedItem>('example', {
      valueEncoding: 'json'
    })
    await core.ready()

    const feed = new HypercoreFeed(core)

    const req = await feed.addRequest({
      operation: 'add',
      who: 'example',
      timestamp: CLOCK.now()
    })

    const savedReq = await feed.get(0)

    t.deepEqual(savedReq, req, 'Loaded request from feed')
  } finally {
    await close()
  }
})
