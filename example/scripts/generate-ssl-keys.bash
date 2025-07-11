#!/usr/bin/env bash

openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' \
  -addext "subjectAltName = DNS:localhost" \
  -keyout ./keys/localhost-private.pem -out ./keys/localhost.pem

echo "Add ./keys/localhost.pem to your browser. In Chrome as a custom certificate at chrome://certificate-manager/localcerts."
