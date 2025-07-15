if (document.readyState === 'loading')
  document.addEventListener('DOMContentLoaded', handleDomContentLoaded)
else
  handleDomContentLoaded()

if (!navigator.serviceWorker)
    throw new Error('Browser does not support registering service worker')

const registration = await navigator.serviceWorker.register('/service-worker.js', { type: 'module' })
console.log('Service Worker registered')

await registration.update()

function handleDomContentLoaded() {
  const subscribeButton = document.getElementById('subscribe')
  subscribeButton.addEventListener('click', e => {
    subscribeToNotifications().catch(e => console.error(e))
  })
}

async function subscribeToNotifications() {
  const permission = await Notification.requestPermission()

  if (permission !== 'granted')
    return console.warn('No permission for notifications')

  const subscription = await getPushSubscription()

  const registration = await registerPushSubscription(subscription)

  console.log('Subscription registered:', registration)
}

async function getPushSubscription() {
  const existingSubscription = await registration.pushManager.getSubscription()
  if (existingSubscription)
    return existingSubscription

  console.log('Obtaining application server key')
  const keyResponse = await fetch('/api/vapid-key')
  if (!keyResponse.ok)
    throw new Error(`Could not obtain application server key, please check network tab and server logs`)

  const keyResult = await keyResponse.json()

  console.log('Subscribing user...')
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyResult.publicKeyBase64Url,
  })

  return subscription
}

/** @param {PushSubscription} subscription */
async function registerPushSubscription(subscription) {
  console.log('Registering push subscription:', subscription.toJSON())

  const response = await fetch('/api/register-push-subscription', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok)
    throw new Error(`Failed to register push subscription.\nStatus ${response.status}\n${await response.text()}`)

  return response.json()
}
