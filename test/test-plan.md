# Blackbox Tests for Web Push Notification Implementation

This test plan ensures the correct functionality of the `sendPushNotification` implementation by focusing on three key areas: VAPID authentication, general protocol compliance, and payload encryption/decryption.

---

## 1. VAPID Authentication and Authorization

These tests verify that the **Voluntary Application Server Identification (VAPID)** header is correctly generated and signed, which allows the push service (simulated by your controlled endpoint) to authenticate the application server.

| Test Case | Description | Expected Endpoint Behavior / Check |
| :--- | :--- | :--- |
| **Correct VAPID Header Format** | Send a standard notification. | The endpoint must receive a request with the **`Authorization`** header in the format `vapid t=<JWT>, k=<public_key>`. |
| **Verify JWT Signature** | Check the **JWT** part (`t=...`) of the `Authorization` header. | The endpoint must use the provided VAPID public key (`k=...`) to **verify the JWT signature**. Verification must succeed. |
| **Verify JWT Claims** | Check the body claims of the signed **JWT**. | The endpoint must verify: <br> • **`aud`** (Audience) matches the endpoint's origin (e.g., `https://example.com`). <br> • **`sub`** (Subject) matches the VAPID subject (e.g., `mailto:support@your-domain.com`). <br> • **`exp`** (Expiration) is a future timestamp. |

---

## 2. General Protocol Headers

These tests check for the presence and correct values of mandatory Web Push protocol headers.

| Test Case | Description | Expected Endpoint Behavior / Check |
| :--- | :--- | :--- |
| **Content-Encoding** | Send a standard notification. | The **`Content-Encoding`** header must be present and set to **`aes128gcm`**. |
| **TTL Header** | Send a standard notification. | The **`TTL`** header must be present and set to **`86400`** (24 hours), as hardcoded in `createWebPushHeaders`. |
| **Request Method** | Send a standard notification. | The HTTP method must be **`POST`**. |

---

## 3. Encrypted Payload (Content and Structure)

This is the critical test, ensuring the payload is correctly encrypted using **AES128-GCM** and structured according to the Web Push payload encryption standard. The controlled endpoint must attempt to **decrypt the request body** using the client keys from the `Subscription` object.

| Test Case | Description | Expected Endpoint Behavior / Check |
| :--- | :--- | :--- |
| **Successful Decryption** | Send a notification with a known `payload` (e.g., `{"test": "data"}`). | The endpoint must successfully **decrypt the entire request body**. |
| **Salt Extraction** | Check the first 16 bytes of the request body. | The endpoint must correctly extract the **16-byte `salt`** from the start of the body. |
| **Server Public Key Extraction** | Check the 65 bytes following the 4-byte record size. | The endpoint must correctly extract the **65-byte uncompressed server public key** (P-256 curve) from the body. |
| **Padding Validation** | Check the decrypted content. | The final decrypted plaintext must be the original payload string (e.g., `{"test": "data"}`) followed **exactly** by the **padding delimiter byte `0x02`**. |

---

## 4. Error Handling

These tests verify that the `sendPushNotification` function correctly handles various HTTP status codes returned by the push service (simulated by your controlled endpoint).

| Test Case | Endpoint Response Status | Expected Application Behavior |
| :--- | :--- | :--- |
| **Success** | Returns HTTP Status **`201`** (or `200`). | The function must **resolve without throwing an error**. |
| **404 Not Found** | Returns HTTP Status **`404`**. | The function must **throw a `PushServerError`** with `status` set to `404` (simulates a defunct or expired subscription). |
| **400 Bad Request** | Returns HTTP Status **`400`** with a specific error body. | The function must **throw a `PushServerError`** with `status` set to `400` and the message containing the error response body. |
| **500 Server Error** | Returns HTTP Status **`500`**. | The function must **throw a `PushServerError`** with `status` set to `500` (simulates a temporary server issue). |
