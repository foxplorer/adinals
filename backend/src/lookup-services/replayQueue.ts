/**
 * Serializes and coalesces per-collection replays.
 *
 * Two problems appear the moment real submissions arrive rather than tests.
 *
 * `replaceCollectionProjection` clears a collection's ads and reinserts them,
 * which is not atomic. Two admissions in the same collection landing together
 * can interleave that delete with the other's insert and leave ads missing from
 * the projection — a silently short answer, which is the worst shape of bug
 * this layer can have.
 *
 * And a backfill submits a collection's records one at a time, so a naive
 * rebuild-per-admission re-derives the whole collection once per record: a
 * thirty-record collection costs thirty replays of increasing size.
 *
 * One run at a time per collection fixes the first. Coalescing every request
 * that arrives during a run into a single follow-up fixes the second, and is
 * safe because a replay derives from whatever evidence is stored when it runs
 * — a later replay subsumes an earlier one completely. A caller always waits
 * for a replay that started after its own write.
 */
export class CollectionReplayQueue {
  private readonly running = new Map<string, Promise<void>>()
  private readonly queued = new Map<string, Promise<void>>()

  /** Resolves once a replay reflecting the caller's write has completed. */
  async request(key: string, task: () => Promise<void>): Promise<void> {
    // A replay that has not started yet will observe this write too, so
    // joining it is both correct and one fewer rebuild.
    const alreadyQueued = this.queued.get(key)
    if (alreadyQueued) return await alreadyQueued

    const inFlight = this.running.get(key)
    if (!inFlight) return await this.start(key, task)

    let followUp: Promise<void>
    followUp = inFlight
      .catch(() => undefined)
      .then(async () => {
        // Leaving the queue before running means a request arriving during
        // this replay correctly queues another rather than joining this one.
        if (this.queued.get(key) === followUp) this.queued.delete(key)
        await this.start(key, task)
      })
    this.queued.set(key, followUp)
    return await followUp
  }

  private async start(key: string, task: () => Promise<void>): Promise<void> {
    let run: Promise<void>
    run = task().finally(() => {
      if (this.running.get(key) === run) this.running.delete(key)
    })
    this.running.set(key, run)
    return await run
  }

  /** Outstanding work, so a shutdown or a test can wait it out. */
  async drain(): Promise<void> {
    while (this.running.size > 0 || this.queued.size > 0) {
      await Promise.allSettled([...this.running.values(), ...this.queued.values()])
    }
  }
}
