import { test, describe, it, before, after, beforeEach } from 'node:test'
import { deepStrictEqual, rejects, strictEqual } from 'node:assert'
import { createServer } from 'node:http'
import { sendPushNotification, PushServerError } from '../src/sendPushNotification.js'
import { readFileSync } from 'node:fs'
import { once } from 'node:events'

const vapidKeys = JSON.parse(readFileSync('test/vapid-keys.json', 'utf-8'))

const vapid = {
  publicKey: vapidKeys.publicKeyBase64Url,
  privateKey: vapidKeys.privateKeyPem,
  subject: 'mailto:test@test.com'
}

const payload = 'test-payload'

describe('sendPushNotification', () => {
  /** @type {import('node:http').Server} */
  let server
  /** @type {Array<{ headers: any, body: string }>} */
  let requests
  let handleResponse

  before(async () => {
    server = createServer((req, res) => {
      let body = ''
      req.on('data', chunk => {
        body += chunk
      })
      req.on('end', () => {
        requests.push({
          headers: req.headers,
          body
        })
        if (handleResponse)
          handleResponse(res)
        else {
          res.writeHead(201)
          res.end()
        }
      })
    })
    server.listen(0, '0.0.0.0')
    await once(server, 'listening')
  })

  after(async () => {
    await close(server)
  })

  beforeEach(() => {
    requests = []
    handleResponse = null
  })

  it('should send a push notification', async () => {
    await sendPushNotification({
      subscription: getSubscription(server),
      vapid,
      payload
    })

    strictEqual(requests.length, 1)
    const [request] = requests
    deepStrictEqual(request.headers['ttl'], '86400')
    deepStrictEqual(request.headers['content-encoding'], 'aes128gcm')
    deepStrictEqual(request.headers['authorization'].startsWith('vapid t='), true)
  })

  it('should throw PushServerError on 404 response', async () => {
    handleResponse = (res) => {
      res.writeHead(404)
      res.end()
    }

    await rejects(
      sendPushNotification({
        subscription: getSubscription(server),
        vapid,
        payload
      }),
      (err) => {
        strictEqual(err instanceof PushServerError, true)
        if (err instanceof PushServerError)
          strictEqual(err.status, 404)
        return true
      }
    )
  })

  it('should throw PushServerError on 500 response', async () => {
    handleResponse = (res) => {
      res.writeHead(500)
      res.end()
    }

    await rejects(
      sendPushNotification({
        subscription: getSubscription(server),
        vapid,
        payload
      }),
      (err) => {
        strictEqual(err instanceof PushServerError, true)
        if (err instanceof PushServerError)
          strictEqual(err.status, 500)
        return true
      }
    )
  })

  it('should throw error on malformed subscription', async () => {
    await rejects(
      sendPushNotification({
        subscription: { ...getSubscription(server), keys: undefined },
        vapid,
        payload
      }),
      TypeError
    )
  })

  it('should throw error on malformed VAPID credentials', async () => {
    await rejects(
      sendPushNotification({
        subscription: getSubscription(server),
        vapid: { ...vapid, privateKey: undefined },
        payload
      }),
      Error
    )
  })
})

function getSubscription(server) {
  const { port, address } = server.address()
  return {
    endpoint: `http://${address}:${port}`,
    keys: {
      p256dh: 'BIPUL12DLfytvTajnryr2PRdAgXS3HGKiLqndGcJGabyhHheJYlNGCeXl1dn18gSJ1WAkAPIxr4gK0_dQds4yiI',
      auth: 'FPssNDTKnInHVndSTdbKFw'
    },
    expirationTime: Date.now() + 10000
  }
}


function close(server) {
  return new Promise(resolve => server.close(resolve))
}
