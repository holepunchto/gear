import { getDB } from '$lib/server/gip'
import { events } from '$lib/server/events'

// Warm the db at startup, not on first request. Once it's ready, attach the
// event hub once — every SSE handler subscribes to the hub instead of
// running its own setInterval, so we get O(events) work instead of
// O(clients × topics × tickRate).
const dbPromise = getDB().then(async (db) => {
  events.attach(db)
  return db
})

export const handle = async ({ event, resolve }) => {
  event.locals.db = await dbPromise
  return resolve(event)
}
