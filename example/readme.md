# Running the example

Note, in local development you might want to `yarn link` in the root directory and
`yarn link '@kaliber/web-push'` in this `examples` directory.

## Prepare keys

```
yarn generate-vapid-keys ./keys/vapid-keys.json
yarn generate-ssl-keys
```

In some browsers you need to specifically add the `localhost.pem` key as a custom (trusted)
certificate (chrome://certificate-manager/localcerts).

## Start server

```
yarn serve
```

By default it starts on port `8080`, you can specify another port like this: `PORT=8181 yarn serve`

## Visit the site

*Note:* the server is `https` with a self-signed certificate.

The button `Subscribe to web push` registers the subscription at the server.

The form is used to send push messages. You can open different browsers to test.

Note the the button and the form are completely separate; you don't need to subscribe to send push
messages. So you could subscribe in one browser and send the message from another browser.


# Explanation

This example was create without dependencies (other than node and @kaliber/web-push) and is not
suitable for production. It is meant to show all aspects of web push.

## server.js

A very basic https server, it serves the `client-*.js` files, the `service-worker.js` file and
handles the following api requests:

- `GET /api/vapid-key` - Provides the public VAPID key (needed for the subscription)
- `POST /api/register-push-subscription` - Stores the subscription obtained from the browser
  `POST /api/send-push-notification` - Sends a push notification

## `index.html`

A very basic HTML page with the following sections:

- A `Subscribe to web push` button - This registers the service worker, asks for permission, creates a subscription and calls the API to store it (more info at `client-subscribe-to-web-push.js` and `service-worker.js`).
- A form to send a push message - This sends the form to the API and uses the library to send the push message  (more info at `client-web-push-form-handler.js`)

## `client-subscribe-to-web-push.js`

This file registers the service worker which is need to receive push messages. It also asks for permission and creates a subscription. This subscription is sent to the server in order for the server to be able to send push messages for that subscription.

## `service-worker.js`

A very simple service worker that shows a system level push notification.

## `client-web-push-form-handerl.js`

This file listens for a form submit and sends that information to the server API in order to send a push message to all available subscriptions.

## `server-web-push.js`

This file contains the subscriptions and calls the library for each subscription.
