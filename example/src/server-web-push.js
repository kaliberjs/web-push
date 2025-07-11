import fs from 'node:fs'
import { PushServerError, sendPushNotification } from '@kaliber/web-push'
/** @import { Subscription } from '@kaliber/web-push' */

/** @typedef {{ privateKeyPem: string, publicKeyBase64Url: string }} VapidKeys */

const vapidKeysJson = fs.readFileSync('./keys/vapid-keys.json', { encoding: 'utf-8' })
export const vapidKeys = /** @type {VapidKeys} */ JSON.parse(vapidKeysJson)

/** @type {Set<Subscription>} */
const pushSubscriptions = new Set()

/** @param {Subscription} subscription */
export function addPushSubscription(subscription) {
  const exists = Array.from(pushSubscriptions).some(existingSubscription => existingSubscription.endpoint === subscription.endpoint)
  if (exists)
    return { newSubscription: false }

  console.log('Registered subscription')
  pushSubscriptions.add(subscription)
  return { newSubscription: true }
}

/** @param {object} data */
export async function sendPushNotificationToAllSubscriptions(data) {
  const invalidSubscriptions = []

  console.log(`Sending push notification to ${pushSubscriptions.size} subscriptions`)

  for (const subscription of pushSubscriptions) {
    try {
      await sendPushNotification({
        subscription,
        vapid: {
          privateKey: vapidKeys.privateKeyPem,
          publicKey: vapidKeys.publicKeyBase64Url,
          subject: `mailto:user@example.com`
        },
        payload: JSON.stringify(data)
      })
    } catch (e) {
      if (e instanceof PushServerError && e.status === 410 /* GONE */)
        invalidSubscriptions.push(subscription)
      else
        throw e
    }
  }

  for (const subscription of invalidSubscriptions) {
    pushSubscriptions.delete(subscription)
  }

  if (invalidSubscriptions.length)
    console.log(`Removed ${invalidSubscriptions.length} invalid subscriptions`)
}
