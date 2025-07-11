# Web push library

This library contains utilities for sending push messages. See the `example` directory for a full circle implementation.


## Usage

Importing the library.

```javascript
import { sendPushNotification } from '@kaliber/web-push'
```

Note that in node `v22.12.0+` you can also `require('@kaliber/web-push')`.


Sending push messages.

```javascript
await sendPushNotification({
  subscription,
  vapid: {
    privateKey: vapidKeys.privateKeyPem,
    publicKey: vapidKeys.publicKeyBase64Url,
    subject: `mailto:user@example.com`
  },
  payload: JSON.stringify(data)
})
```


Generating VAPID (Voluntary Application Server Identification) keys.

```bash
yarn generate-vapid-keys ./config/vapid-keys.json
```

See the `example` directory for an example implementation.


## Web push flow

Web push has a few ingredients:

- A service-worker to handle incoming web push events.
- A subscription that supplies an endpoint, it is unique for `url` + `browser` + `device` + `user`.
- A browser supplied endpoint to send push notifications to the specific browser instance.
- The payload that is sent to the endpoint. This consists of 2 parts:
  - A header where authorization is done using VAPID keys.
  - An encrypted payload which is complicated and uses secrets from the subscription.

Important concepts:

- A service worker is registered for a certain domain in the browser on the machine of a user.
- You need a trusted https connection for web push to work.
- Browsers follow the standard but have small differences, so make sure you test in all of them.

The main flow is like this:

- You register a service worker.
- Using the registration you obtain a subscription.
- The subscription is stored on the server.
- The server uses the subscriptions to send push messages.
- The browser vendor (owner of the endpoint for the subscription) delivers the push event to the service worker.
- The service worker handles the event and triggers the system notification (for example).
