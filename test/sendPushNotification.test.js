import assert from 'node:assert'
import { describe, it, before, after } from 'node:test'
import http from 'node:http'
import fs from 'node:fs'
import { sendPushNotification } from '../src/sendPushNotification.js'
import crypto from 'node:crypto'
import * as jose from 'jose'

const vapid = JSON.parse(fs.readFileSync(new URL('./vapid.json', import.meta.url), 'utf-8'))

// We'll capture the request here
let request = null

const server = http.createServer((req, res) => {
  const body = []
  req.on('data', chunk => body.push(chunk))
  req.on('end', () => {
    request = {
      method: req.method,
      headers: req.headers,
      body: Buffer.concat(body)
    }
    res.writeHead(201, { 'Content-Type': 'application/json' })
    res.end()
  })
})

describe('sendPushNotification', { concurrency: 1 }, () => {
  before(() => new Promise(resolve => server.listen(0, resolve)))
  after(() => new Promise(resolve => server.close(resolve)))

  it('should send a push notification', async () => {
    request = null
    const subscription = createSubscription()

    await sendPushNotification({
      subscription,
      vapid: createVapid(),
      payload: 'test payload'
    })

    assert.ok(request, 'Expected the push service to receive a request')
    assert.strictEqual(request.method, 'POST')
    assert.strictEqual(request.headers['ttl'], '86400')
    assert.strictEqual(request.headers['content-encoding'], 'aes128gcm')
    assert.ok(request.headers['authorization'].startsWith('vapid t='))
    assert.ok(request.body.length > 0)
  })

  it('should encrypt the payload', async () => {
    request = null
    const subscription = createSubscription()

    const payload = 'test payload'
    await sendPushNotification({
      subscription,
      vapid: createVapid(),
      payload
    })

    assert.ok(request, 'Expected the push service to receive a request')
    const decrypted = decryptPayload(request.body, subscription._client, subscription.keys.auth)

    assert.strictEqual(decrypted.toString('utf-8'), payload)
  })

  it('should encrypt the payload with correct padding', async () => {
    request = null
    const subscription = createSubscription()
    const payload = 'test payload'

    await sendPushNotification({
      subscription,
      vapid: createVapid(),
      payload
    })

    assert.ok(request, 'Expected the push service to receive a request')
    const decrypted = decryptPayload(request.body, subscription._client, subscription.keys.auth, true)

    // Find the last non-zero octet to locate the padding delimiter
    let delimiterIndex = decrypted.length - 1
    while (delimiterIndex >= 0 && decrypted[delimiterIndex] === 0) {
      delimiterIndex--
    }

    assert.ok(delimiterIndex >= 0, 'Expected to find a padding delimiter')
    assert.strictEqual(decrypted[delimiterIndex], 0x02, 'Expected padding delimiter to be 0x02 for the last record')

    const extractedPayload = decrypted.subarray(0, delimiterIndex)
    assert.strictEqual(extractedPayload.toString('utf-8'), payload, 'Extracted payload should match original payload')
  })

  it('should send a valid VAPID JWT', async () => {
    request = null
    const subscription = createSubscription()

    const vapid = createVapid()
    await sendPushNotification({
      subscription,
      vapid,
      payload: 'test'
    })

    assert.ok(request, 'Expected the push service to receive a request')

    const authHeader = request.headers['authorization']
    assert.ok(authHeader.startsWith('vapid t='), 'Expected auth header to start with "vapid t="')

    const token = authHeader.substring('vapid t='.length).split(',')[0]
    const publicKey = await jose.importSPKI(vapid.publicKeyPem, 'ES256')
    const { payload } = await jose.jwtVerify(token, publicKey, {
      algorithms: ['ES256']
    })

    const { origin } = new URL(subscription.endpoint)
    assert.strictEqual(payload.aud, origin, 'Expected audience to be the origin of the subscription endpoint')
    assert.ok(payload.exp > Date.now() / 1000, 'Expected expiration to be in the future')
    assert.strictEqual(payload.sub, vapid.subject, 'Expected subject to match VAPID subject')
  })

  it('should send Urgency and Topic headers', async () => {
    request = null
    const subscription = createSubscription()

    await sendPushNotification({
      subscription,
      vapid: createVapid(),
      payload: 'test',
      urgency: 'high',
      topic: 'test-topic'
    })

    assert.ok(request, 'Expected the push service to receive a request')
    assert.strictEqual(request.headers['urgency'], 'high')
    assert.strictEqual(request.headers['topic'], 'test-topic')
  })

  it('should throw for push service errors', async () => {
    for (const status of [404, 410, 500]) {
      const errorServer = http.createServer((req, res) => {
        res.writeHead(status, { 'Content-Type': 'text/plain' })
        res.end(`Error ${status}`)
      }).listen(0)

      try {
        await sendPushNotification({
          subscription: { ...createSubscription(), endpoint: `http://localhost:${errorServer.address().port}` },
          vapid: createVapid(),
          payload: 'test payload'
        })
        assert.fail('should have thrown')
      } catch (e) {
        assert.strictEqual(e.status, status)
        assert.strictEqual(e.message, `Push service responded with status ${status}: Error ${status}`)
      } finally {
        await new Promise(resolve => errorServer.close(resolve))
      }
    }
  })
})

function createSubscription(keys = {}) {
  const client = crypto.createECDH('prime256v1')
  client.generateKeys()

  return {
    endpoint: `http://localhost:${server.address().port}`,
    keys: {
      p256dh: toBase64Url(client.getPublicKey()),
      auth: toBase64Url(crypto.randomBytes(16)),
      ...keys
    },
    expirationTime: null,
    _client: client
  }
}

function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function createVapid() {
  return {
    publicKey: vapid.publicKeyBase64Url,
    publicKeyPem: vapid.publicKeyPem,
    privateKey: vapid.privateKeyPem,
    subject: 'mailto:test@example.com'
  }
}

/**
 * @param {Buffer} encryptedPayload
 * @param {import('node:crypto').ECDH} client
 * @param {string} auth
 * @param {boolean} [raw=false]
 */
function decryptPayload(encryptedPayload, client, auth, raw = false) {
  const salt = encryptedPayload.subarray(0, 16)
  const recordSize = encryptedPayload.readUInt32BE(16)
  const serverPublicKey = encryptedPayload.subarray(21, 86)
  const ciphertext = encryptedPayload.subarray(86)

  const sharedSecret = client.computeSecret(serverPublicKey)
  const authSecret = Buffer.from(auth, 'base64url')

  const clientPublicKey = client.getPublicKey()

  const pseudoRandomKeyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    clientPublicKey,
    serverPublicKey,
  ])

  const hashedSharedSecret = crypto.createHmac('sha256', authSecret)
    .update(sharedSecret)
    .digest()

  const pseudoRandomKey = hkdf(hashedSharedSecret, pseudoRandomKeyInfo, 32)

  const hashedPseudoRandomKey = crypto.createHmac('sha256', salt)
    .update(pseudoRandomKey)
    .digest()

  const encryptionKey = hkdf(hashedPseudoRandomKey, contentEncoding('aes128gcm'), 16)
  const nonce = hkdf(hashedPseudoRandomKey, contentEncoding('nonce'), 12)

  const decipher = crypto.createDecipheriv('aes-128-gcm', encryptionKey, nonce)
  decipher.setAuthTag(ciphertext.subarray(ciphertext.length - 16))
  const decrypted = Buffer.concat([decipher.update(ciphertext.subarray(0, ciphertext.length - 16)), decipher.final()])

  if (raw) return decrypted

  // Find the last non-zero octet to locate the padding delimiter
  let delimiterIndex = decrypted.length - 1
  while (delimiterIndex >= 0 && decrypted[delimiterIndex] === 0) {
    delimiterIndex--
  }

  if (delimiterIndex < 0) throw new Error('Padding delimiter not found')

  const delimiter = decrypted[delimiterIndex]
  // As this library only sends a single record, the delimiter must be 0x02
  if (delimiter !== 0x02) throw new Error(`Invalid padding delimiter: ${delimiter}`)


  // The actual payload is the data before the delimiter
  return decrypted.subarray(0, delimiterIndex)
}


/** @param {string} encoding */
function contentEncoding(encoding) {
  return Buffer.from(`Content-Encoding: ${encoding}\0`, 'ascii')
}

/**
 * @param {Buffer} key
 * @param {Buffer} info
 * @param {number} length
 */
function hkdf(key, info, length) {
  return crypto.createHmac('sha256', key)
    .update(info)
    .update(Buffer.from([0x01]))
    .digest()
    .subarray(0, length)
}
