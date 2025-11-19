import crypto from 'node:crypto'

/**
 * @typedef {{
 *   endpoint: string
 *   keys: {
 *     p256dh: string
 *     auth: string
 *   }
 *   expirationTime: number | null
 * }} Subscription
 */

/**
 * Voluntary Application Server Identification
 *
 * @typedef {{
 *   publicKey: string   // Public key as base64 url
 *   privateKey: string  // Private key
 *   subject: string     // mailto:... or https:... typically 'mailto:support@your-Domain.com'
 * }} Vapid
 */

/**
 * @param {{
 *   subscription: Subscription
 *   vapid: Vapid
 *   payload: string     // Typically a JSON object: { "title": "string", "body": "string" }
 *   urgency?: 'very-low' | 'low' | 'normal' | 'high'
 *   topic?: string
 * }} props
 */
export async function sendPushNotification({
  subscription,
  vapid,
  payload,
  urgency,
  topic,
}) {
  const endpoint = subscription.endpoint

  const headers = createWebPushHeaders(endpoint, vapid, { urgency, topic })
  const encryptedPayload = encryptPayload(payload, subscription.keys)

  const response = await fetch(endpoint, { method: 'POST', headers, body: encryptedPayload })
  if (!response.ok)
    throw new PushServerError(
      `Push service responded with status ${response.status}: ${await response.text()}`,
      response.status
    )
}

export class PushServerError extends Error {

  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/**
 * @param {string} endpoint
 * @param {{ publicKey: string, privateKey: string, subject: string }} vapid
 * @param {{ urgency?: string, topic?: string }} [options]
*/
function createWebPushHeaders(endpoint, vapid, options = {}) {
 const audience = new URL(endpoint).origin
 const jwt = createVapidJwt(audience, vapid.subject, vapid.privateKey)

 return {
   'TTL': '86400',
   'Content-Encoding': 'aes128gcm',
   'Authorization': `vapid t=${jwt}, k=${vapid.publicKey}`,
   ...(options.urgency && { 'Urgency': options.urgency }),
   ...(options.topic && { 'Topic': options.topic }),
 }
}

/**
 * @param {string} audience
 * @param {string} subject
 * @param {string} privateKey
 */
function createVapidJwt(audience, subject, privateKey) {
 const header = { typ: 'JWT', alg: 'ES256' }

 const body = {
   aud: audience,
   exp: Math.floor(Date.now() / 1000) + (12 * 60 * 60),
   sub: subject
 }

 const encodedHeader = encodeJson(header)
 const encodedBody = encodeJson(body)
 const unsignedToken = `${encodedHeader}.${encodedBody}`

 const signature = crypto.createSign('SHA256')
   .update(unsignedToken)
   .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
   .toString('base64url')

 return `${unsignedToken}.${signature}`
}

function encodeJson(json) {
 return Buffer.from(JSON.stringify(json)).toString('base64url')
}

/**
 * @param {string} payload
 * @param {{ p256dh: string, auth: string }} subscriptionKeys
 */
function encryptPayload(payload, subscriptionKeys) {
  const client = getClientInfo(subscriptionKeys)
  const server = getServerInfo(client)
  const salt = crypto.randomBytes(16)

  const { encryptionKey, nonce } = createEncryptionKeyAndNonce(client, server, salt)

  const paddedPayload = Buffer.concat([Buffer.from(payload), Buffer.from([0x02])]) // 0x02 is the padding delimiter

  const recordSize = Buffer.alloc(4)
  recordSize.writeUInt32BE(paddedPayload.length + 16 + 16, 0) // padded payload size + tag (16) + buffer (16)

  const header = Buffer.concat([
    salt,                // 16 bytes
    recordSize,          // 4 bytes
    Buffer.from([0x41]), // 1 byte with value 65 (server public key length)
    server.publicKey     // 65 bytes with uncompressed public key
  ])

  const cipher = crypto.createCipheriv('aes-128-gcm', encryptionKey, nonce)
  const encryptedData = Buffer.concat([cipher.update(paddedPayload), cipher.final()])
  const tag = cipher.getAuthTag() // 16-byte authentication tag

  return Buffer.concat([header, encryptedData, tag])
}

/** @typedef {ReturnType<typeof getClientInfo>} ClientInfo */
/** @param {{ p256dh: string, auth: string }} subscriptionKeys */
function getClientInfo(subscriptionKeys) {
  return {
    publicKey: Buffer.from(subscriptionKeys.p256dh, 'base64url'),
    authSecret: Buffer.from(subscriptionKeys.auth, 'base64url'),
  }
}

/** @typedef {ReturnType<typeof getServerInfo>} ServerInfo */
/** @param {ClientInfo} client */
function getServerInfo(client) {
 // Generate server's ECDH key pair (P-256 curve)
 const serverECDH = crypto.createECDH('prime256v1')
 serverECDH.generateKeys()

 return {
   publicKey: serverECDH.getPublicKey(),
   sharedSecret: serverECDH.computeSecret(client.publicKey),
 }
}

/**
 * @param {ClientInfo} client
 * @param {ServerInfo} server
 * @param {Buffer} salt
 */
function createEncryptionKeyAndNonce(client, server, salt) {
  const pseudoRandomKey = createPseudoRandomKey(client, server, salt)

  return {
    encryptionKey: hkdf(pseudoRandomKey, contentEncoding('aes128gcm'), 16), // AES-128-GCM needs 16 bytes
    nonce: hkdf(pseudoRandomKey, contentEncoding('nonce'), 12), // AES-128-GCM nonce is 12 bytes
  }
}

/**
 * @param {ClientInfo} client
 * @param {ServerInfo} server
 */
function createPseudoRandomKey(client, server, salt) {
  const hashedScharedSecret = crypto.createHmac('sha256', client.authSecret)
    .update(server.sharedSecret)
    .digest()

  const pseudoRandomKeyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'ascii'),
    client.publicKey,
    server.publicKey,
  ])
  const pseudoRandomKey = hkdf(hashedScharedSecret, pseudoRandomKeyInfo, 32)

  const hashedPseudoRandomKey = crypto.createHmac('sha256', salt)
    .update(pseudoRandomKey)
    .digest()

  return hashedPseudoRandomKey
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
