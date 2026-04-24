import { getDB } from '$lib/server/gip'
const dbPromise = getDB()  // start warming at startup, not first request

export const handle = async ({ event, resolve }) => {
  event.locals.db = await dbPromise
  return resolve(event)
}
