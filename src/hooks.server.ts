import type { Handle } from '@sveltejs/kit'
import { getDB, type GipDB } from '$lib/server/gip'
import { events } from '$lib/server/events'
import { log, logError } from '$lib/server/log'

// Announce every repo in the library so other devices can find the copies we
// hold. Detached and sequential — each join is a DHT round-trip and no request
// should wait on them. Nothing else does this: without it a repo joins no
// topic until someone opens its page, so a peer adding one of our repos finds
// no seeder and falls back to the blind peers.
async function seedLibrary(db: GipDB) {
  const names = await db.getRepoNames()
  for (const name of names) await db.getCore(name)
  log(`announcing ${names.length} repos`)
}

// Warm the db at startup, not on first request. Once it's ready, attach the
// event hub once — every SSE handler subscribes to the hub instead of
// running its own setInterval, so we get O(events) work instead of
// O(clients × topics × tickRate).
const t0 = Date.now()
const dbPromise = getDB().then(
  async (db) => {
    events.attach(db)
    log(`stack ready in ${Date.now() - t0}ms`)
    seedLibrary(db).catch((err) => logError('seeding library failed', err))
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
