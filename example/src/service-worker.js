/** @type {ServiceWorkerGlobalScope} */
const sw = /** @type {any} */ (self)

sw.addEventListener('install', event => {
  console.log('Service Worker installed')
})

sw.addEventListener('activate', event => {
  console.log('Service worker activated')
 // ensures that the service worker will not be terminated until the promise is resolved
 event.waitUntil(
    // allows an active service worker to take control of all clients (pages) within its scope
    sw.clients.claim()
  )
})

sw.addEventListener('push', event => {
  const data = event.data.json()
  console.log('Push received:', { event, data })

  event.waitUntil(
    // displays a system-level notification to the user
    sw.registration.showNotification(data.title, { body: data.body })
  )
})
