import https from 'node:https'
import fs from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { addPushSubscription, sendPushNotificationToAllSubscriptions, vapidKeys } from './server-web-push.js'

const serverOptions = {
  key: fs.readFileSync('./keys/localhost-private.pem'),
  cert: fs.readFileSync('./keys/localhost.pem'),
}

const host = 'localhost'
const port = Number(process.env.PORT) || 8080

const staticContent = {
  '/': 'index.html',
  '/service-worker.js': 'service-worker.js',
  '/client-subscribe-to-web-push.js': 'client-subscribe-to-web-push.js',
  '/client-web-push-form-handler.js': 'client-web-push-form-handler.js',
}

const requestHandlers = {
  '/api/vapid-key': servePublicVapidKey,
  '/api/register-push-subscription': registerPushSubscription,
  '/api/send-push-notification': sendPushNotification,
}

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
}

const server = https.createServer(serverOptions,
  (req, res) => {
    console.log(`${req.method} ${req.url}`)
    const requestHandler =
      requestHandlers[req.url] ||
      (req.url in staticContent && staticContentHandler)

    if (!requestHandler) {
      console.log(`404 ${req.method} ${req.url}`)
      return writeText(res, 404, 'text/plain', '404 Not Found')
    }

    requestHandler(req, res)
  }
)

server.listen(port, host, () => {
  console.log(`Server is running on https://${host}:${port}`)
})

function staticContentHandler(req, res) {
  const targetFile = staticContent[req.url]

  try {
    const fullPath = path.join('./src/', targetFile)
    const extension = path.extname(fullPath)
    const mimeType = mimeTypes[extension]
    if (!mimeType)
      throw new Error(`No mime type for extension '${extension}'`)

    console.log(`200 ${req.method} ${req.url} ${mimeType}`)
    const contents = fs.readFileSync(fullPath, { encoding: 'utf-8' })
    writeText(res, 200, mimeType, contents)
  } catch (e) {
    writeText(res,500, 'text/plain', `Server error: could not read ${targetFile}`)
    console.error(e)
  }
}

/**
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
function servePublicVapidKey(req, res) {
  if (req.method !== 'GET')
    return writeText(res, 405, 'text/plain', '405 Method Not Allowed')

  const body = JSON.stringify({ publicKeyBase64Url: vapidKeys.publicKeyBase64Url })

  writeText(res, 200, 'application/json', body)
}

/**
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
function registerPushSubscription(req, res) {
  if (req.method !== 'POST')
    return writeText(res, 405, 'text/plain', '405 Method Not Allowed')

  try {
    withBodyAsJson(req, subscription => {
      const result = addPushSubscription(subscription)

      writeText(res, 200, 'application/json', JSON.stringify(result))
    })
  } catch (e) {
    writeText(res, 500, 'text/plain', `Server error:`)
    console.error(e)
  }
}

/**
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 */
function sendPushNotification(req, res) {
  if (req.method !== 'POST')
    return writeText(res, 405, 'text/plain', '405 Method Not Allowed')

  try {
    withBodyAsJson(req, data => {
      console.log(data)

      sendPushNotificationToAllSubscriptions(data)
        .then(() => {
          writeText(res, 200, 'application/json', JSON.stringify({ sent: true }))
        })
        .catch(e => {
          writeText(res, 500, 'text/plain', `Server error:`)
          console.error(e)
        })
      })
    } catch (e) {
    writeText(res, 500, 'text/plain', `Server error:`)
    console.error(e)
  }
}

/**
 * @param {IncomingMessage} req
 * @param {(body: any) => void} callback
 */
function withBodyAsJson(req, callback) {
  let body = ''
  req.on('data', chunk => { body += chunk.toString() })
  req.on('end', () => callback(JSON.parse(body)))
}

/**
 * @param {ServerResponse} res
 * @param {number} status
 * @param {string} contentType
 * @param {string} body
 */
function writeText(res, status, contentType, body, headers = undefined) {
  res.writeHead(status, { 'Content-Type': contentType, ...headers })
  res.end(body)
}

