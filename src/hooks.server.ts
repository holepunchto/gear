import type { Handle } from '@sveltejs/kit'
import { getDB } from '$lib/server/gip'
import { events } from '$lib/server/events'
import { log, logError } from '$lib/server/log'

// Warm the db at startup, not on first request. Once it's ready, attach the
// event hub once — every SSE handler subscribes to the hub instead of
// running its own setInterval, so we get O(events) work instead of
// O(clients × topics × tickRate).
const t0 = Date.now()
const dbPromise = getDB().then(
  async (db) => {
    events.attach(db)
    log(`stack ready in ${Date.now() - t0}ms`)
    return db
  },
  (err) => {
    logError('stack failed to boot', err)
    throw err
  }
)

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.db = await dbPromise
  return resolve(event)
}
