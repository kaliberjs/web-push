#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const [executor, currentFile, targetFileName] = process.argv

if (!targetFileName)
  errorExit(`Missing target file name, usage: generate-vapid-keys vapid-keys.json`)

ensureKeyFile(targetFileName)

function ensureKeyFile(keyFile) {
  if (fs.statSync(keyFile, { throwIfNoEntry: false })?.isFile())
    return console.log('Skipping creation of keys: file already exists')

  console.log(`Generating keys...`)
  const vapidKeys = generateVapidKeys()

  fs.mkdirSync(path.dirname(keyFile), { recursive: true })
  fs.writeFileSync(keyFile, JSON.stringify(vapidKeys, null, 2))
  console.log(`Keys stored at ${keyFile}`)
}


function generateVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })

  const publicKeyBuffer = Buffer.from(
    publicKey.export({ type: 'spki', format: 'der' }).subarray(26)
  )

  return {
    publicKeyBase64Url: publicKeyBuffer.toString('base64url'),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }
}

function errorExit(message) {
  console.error(message)
  process.exit(1)
}
