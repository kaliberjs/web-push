document.addEventListener('DOMContentLoaded', handleDomContentLoaded)

function handleDomContentLoaded() {
  const form = /** @type {HTMLFormElement} */ (document.getElementById('push-notification-form'))
  form.addEventListener('submit', handleSubmit)

  /** @param {SubmitEvent} e */
  function handleSubmit(e) {
    e.preventDefault()
    const formData = Object.fromEntries(new FormData(form))

    sendPushNotification(formData).catch(e => console.error(e))
  }
}

async function sendPushNotification(data) {
  console.log('Sending push notification')

  const response = await fetch('/api/send-push-notification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })

  if (!response.ok)
    throw new Error(`Error sending push notification.\nStatus ${response.status}\n${await response.text()}`)

  console.log('Push notification sent')
}
