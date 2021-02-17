import test, { Test } from 'fresh-tape'

type testCB = (t: Test) => Promise<void>

export default function testPromise (text: string, cb: testCB): void {
  test(text, (t) => {
    t.timeoutAfter(5000)
    cb(t).then(() => {
      t.end()
    }).catch((e) => {
      t.fail(e.stack)
    })
  })
}
