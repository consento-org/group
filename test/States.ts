import test from 'fresh-tape'
import { States } from '../src/States'

test('Storing some states', t => {
  const states = new States()
  t.deepEquals(Object.keys(states.byState), [])
  t.end()
})

test('Setting a state', t => {
  const states = new States()
  states.set('id', 'mystate')
  t.equals(states.get('id'), 'mystate')
  t.deepEquals(Array.from(states.byState('mystate')), ['id'])
  t.end()
})

test('Changing a state', t => {
  const states = new States()
  states.set('id', 'mystate')
  states.set('id', 'otherState')
  t.equals(states.get('id'), 'otherState')
  t.deepEquals(Array.from(states.byState('mystate')), [])
  t.deepEquals(Array.from(states.byState('otherState')), ['id'])
  t.end()
})

test('Having multiple entries for the same state', t => {
  const states = new States()
  states.set('id1', 'mystate')
  states.set('id2', 'mystate')
  t.deepEquals(Array.from(states.byState('mystate')), ['id1', 'id2'])
  states.delete('id2')
  states.delete('id1')
  t.deepEquals(Array.from(states.byState('mystate')), [])
  t.end()
})

test('Typing states', t => {
  type allowedStates = 'foo' | 'bar'
  const states = new States<allowedStates>()
  t.deepEquals(Array.from(states.byState('foo')), [])
  t.deepEquals(Array.from(states.byState('bar')), [])
  states.set('id', 'bar')
  t.end()
})

test('Deleting States', t => {
  const states = new States()
  states.set('id', 'foo')
  states.delete('id')
  t.deepEquals(Array.from(states.byState('foo')), [])
  states.set('id', 'bar')
  t.end()
})

test('States iterator', t => {
  const states = new States()
  states.set('a', 'foo')
  states.set('d', 'bar')
  states.set('b', 'bar')
  states.set('c', 'foo')
  states.set('e', 'baz')
  t.deepEquals(Array.from(states), [
    ['a', 'foo'],
    ['c', 'foo'],
    ['d', 'bar'],
    ['b', 'bar'],
    ['e', 'baz']
  ])
  t.end()
})

test('has state', t => {
  const states = new States()
  t.notOk(states.has('a'))
  states.set('a', '1')
  t.ok(states.has('a'))
  states.delete('a')
  t.notOk(states.has('a'))
  t.end()
})

test('setting an existing value again should quick exit', t => {
  const states = new States()
  states.set('a', '1')
  states.set('a', '1')
  t.equals(states.get('a'), '1')
  t.end()
})

test('setting an existing key again should not keep copies', t => {
  const states = new States()
  states.set('b', '2')
  states.set('a', '1')
  states.set('a', '2')
  states.set('a', '3')
  t.deepEquals(Array.from(states), [['b', '2'], ['a', '3']])
  t.end()
})
