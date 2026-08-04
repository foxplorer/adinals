import assert from 'node:assert/strict'
import test from 'node:test'
import { CollectionReplayQueue } from './replayQueue.js'

const deferred = (): {
  promise: Promise<void>
  resolve: () => void
} => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test('replays of one collection never overlap', async () => {
  const queue = new CollectionReplayQueue()
  let active = 0
  let maxActive = 0
  const gate = deferred()

  const task = async (): Promise<void> => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await gate.promise
    active -= 1
  }

  const runs = [
    queue.request('c', task),
    queue.request('c', task),
    queue.request('c', task)
  ]
  gate.resolve()
  await Promise.all(runs)

  assert.equal(maxActive, 1, 'a delete/insert rebuild must never interleave with another')
})

test('a burst coalesces into one running and one follow-up replay', async () => {
  const queue = new CollectionReplayQueue()
  let started = 0
  const gate = deferred()

  const task = async (): Promise<void> => {
    started += 1
    await gate.promise
  }

  // Ten admissions of the same collection arriving during one rebuild must not
  // produce ten rebuilds; the last one subsumes the rest.
  const runs = Array.from({ length: 10 }, async () => await queue.request('c', task))
  gate.resolve()
  await Promise.all(runs)

  assert.equal(started, 2, 'one in flight plus a single coalesced follow-up')
})

test('different collections still replay concurrently', async () => {
  const queue = new CollectionReplayQueue()
  let active = 0
  let maxActive = 0
  const gate = deferred()

  const task = async (): Promise<void> => {
    active += 1
    maxActive = Math.max(maxActive, active)
    await gate.promise
    active -= 1
  }

  const runs = [
    queue.request('a', task),
    queue.request('b', task),
    queue.request('c', task)
  ]
  gate.resolve()
  await Promise.all(runs)

  assert.equal(maxActive, 3)
})

test('every caller waits for a replay that started after its own write', async () => {
  const queue = new CollectionReplayQueue()
  const observed: number[] = []
  let writes = 0
  const gate = deferred()

  const task = async (): Promise<void> => {
    const seen = writes
    await gate.promise
    observed.push(seen)
  }

  writes = 1
  const first = queue.request('c', task)
  writes = 2
  const second = queue.request('c', task)
  gate.resolve()
  await Promise.all([first, second])

  // The second caller's replay must have begun after its write was stored.
  assert.deepEqual(observed, [1, 2])
})

test('a failed replay does not wedge the collection', async () => {
  const queue = new CollectionReplayQueue()
  await assert.rejects(
    queue.request('c', async () => { throw new Error('storage unavailable') }),
    /storage unavailable/
  )

  let ran = false
  await queue.request('c', async () => { ran = true })
  assert.equal(ran, true)
})

test('a follow-up still runs when the replay before it failed', async () => {
  const queue = new CollectionReplayQueue()
  const gate = deferred()
  let ran = false

  const failing = queue.request('c', async () => {
    await gate.promise
    throw new Error('first replay failed')
  })
  const followUp = queue.request('c', async () => { ran = true })

  gate.resolve()
  await assert.rejects(failing, /first replay failed/)
  await followUp
  assert.equal(ran, true)
})

test('drain waits out everything outstanding', async () => {
  const queue = new CollectionReplayQueue()
  const gate = deferred()
  let finished = 0

  void queue.request('a', async () => { await gate.promise; finished += 1 })
  void queue.request('b', async () => { await gate.promise; finished += 1 })
  gate.resolve()

  await queue.drain()
  assert.equal(finished, 2)
})
