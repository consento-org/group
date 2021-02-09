import test from 'fresh-tape'
import { VersionedStates } from '../src/VersionedStates'
import HLC from '@consento/hlc'

const hlc = new HLC()

test('Storing some states', t => {
  const states = new VersionedStates()
  t.equals(states.get('foo'), undefined)
  t.equals(states.has('foo'), false)
  t.deepEquals(Array.from(states), [])
  states.set(hlc.now(), 'a', 'baz')
  states.set(hlc.now(), 'foo', 'baz')
  t.equals(states.get('foo'), 'baz')
  t.equals(states.has('foo'), true)
  t.deepEquals(Array.from(states.byState('baz')), ['a', 'foo'])
  t.equals(states.get('bar'), undefined)
  t.equals(states.has('bar'), false)
  t.end()
})

test('Deleting a state', t => {
  const states = new VersionedStates()
  states.set(hlc.now(), 'bar', 'stateA')
  states.set(hlc.now(), 'foo', 'stateB')
  states.set(hlc.now(), 'x', 'stateA')
  states.set(hlc.now(), 'y', 'stateB')
  states.delete(hlc.now(), 'foo')
  t.deepEquals(Array.from(states), [['bar', 'stateA'], ['x', 'stateA'], ['y', 'stateB']])
  t.equals(states.get('foo'), undefined)
  t.equals(states.has('foo'), false)
  t.equals(states.get('x'), 'stateA')
  t.equals(states.has('x'), true)
  t.equals(states.byState('stateA').has('x'), true)
  t.equals(states.byState('stateA').size, 2)
  t.deepEquals(Array.from(states.byState('stateA')), ['bar', 'x'])
  t.equals(states.byState('stateB').has('foo'), false)
  t.equals(states.byState('stateB').has('y'), true)
  t.equals(states.byState('stateB').size, 1)
  t.deepEquals(Array.from(states.byState('stateB')), ['y'])
  t.end()
})

test('Versions for data', t => {
  const states = new VersionedStates()
  const start = hlc.now()
  const time = [hlc.now(), hlc.now(), hlc.now(), hlc.now(), hlc.now(), hlc.now()]
  states.set(time[0], 'foo', 'x')
  states.set(time[1], 'foo', 'y')
  states.set(time[2], 'bar', 'z')
  states.set(time[3], 'baz', 'a')
  states.set(time[4], 'bar', 'a')
  t.equals(states.byState('a').has('zoo'), false)
  states.delete(time[5], 'bar')

  t.deepEquals(Array.from(states.latest), [['foo', 'y'], ['baz', 'a']])
  t.deepEquals(Array.from(states.at(start)), [])
  t.deepEquals(Array.from(states.at(time[0])), [['foo', 'x']])
  t.deepEquals(Array.from(states.at(time[1])), [['foo', 'y']])
  t.deepEquals(Array.from(states.at(time[2])), [['foo', 'y'], ['bar', 'z']])
  t.deepEquals(Array.from(states.at(time[3])), [['foo', 'y'], ['bar', 'z'], ['baz', 'a']])
  t.deepEquals(Array.from(states.at(time[4])), [['foo', 'y'], ['baz', 'a'], ['bar', 'a']])
  t.deepEquals(Array.from(states.at(time[5])), [['foo', 'y'], ['baz', 'a']])
  t.end()
})

test('Inserting states out of order', t => {
  const states = new VersionedStates()
  const time = [hlc.now(), hlc.now(), hlc.now(), hlc.now(), hlc.now(), hlc.now()]
  states.set(time[1], 'foo', 'y')
  states.set(time[0], 'foo', 'x')
  t.deepEquals(Array.from(states.latest), [['foo', 'y']])
  t.deepEquals(Array.from(states.at(time[0])), [['foo', 'x']])
  t.deepEquals(Array.from(states.at(time[1])), [['foo', 'y']])
  t.end()
})
