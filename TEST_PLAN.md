# Test Plan: `sendPushNotification`

This document outlines the test plan for the `sendPushNotification` function. The goal is to create a robust test suite that ensures the function's correctness and provides confidence in its behavior.

## 1. Test Strategy

We will employ a **black-box testing** strategy. The internal implementation of `sendPushNotification` will not be considered when writing tests. Instead, we will focus on the function's inputs and outputs.

To test the function's network interactions without making actual network calls, we will **spin up a local mock HTTP server** using the built-in `node:http` module. The `subscription.endpoint` in our test data will point to this local server. This approach has two key advantages:

1.  **Decoupling:** It decouples the tests from the specific HTTP client (`fetch`, `axios`, etc.) used in the implementation. The test will verify the outgoing HTTP request, making it resilient to refactoring.
2.  **No Dependencies:** It adheres to the requirement of not adding any external dependencies.

## 2. Test Environment

-   **Test Framework:** `node:test` (built-in Node.js test runner)
-   **Assertions:** `node:assert` (built-in Node.js assertion library)
-   **HTTP Server:** `node:http` (built-in Node.js module)
-   **Dependencies:** No external testing libraries will be added.

## 3. Test Cases

The following test cases will be implemented to cover the primary functionalities and error conditions of the `sendPushNotification` function.

### Test Case 1: Successful Push Notification

*   **Purpose:** To verify that when a valid `subscription`, `vapid`, and `payload` are provided, the function sends a correctly formatted request to the push service.
*   **Proposed Solution:**
    1.  In the test setup, start a local HTTP server that listens for a `POST` request.
    2.  Provide the mock server's URL as the `endpoint` in the test `subscription` object.
    3.  The mock server will be programmed to capture the request's headers and body upon arrival.
    4.  Call `sendPushNotification` with the modified subscription data.
    5.  The server will respond with a `201 Created` status.
    6.  The test will then assert that the headers and body captured by the server are correct (e.g., `TTL`, `Content-Encoding`, `Authorization` JWT, and encrypted payload).

*   **How to Fail the Test:** A change in the `createWebPushHeaders` function, such as altering the `TTL` value, or a change in `encryptPayload` would cause the assertions against the captured request to fail.

### Test Case 2: Push Service Error - Not Found

*   **Purpose:** To ensure that the function throws a `PushServerError` when the push service responds with a `404 Not Found` or `410 Gone`.
*   **Proposed Solution:**
    1.  Start a mock HTTP server.
    2.  Configure the server to respond to all incoming requests with a `404 Not Found` status code.
    3.  Call `sendPushNotification` with the `endpoint` pointing to the mock server.
    4.  Use `assert.rejects` to verify that a `PushServerError` is thrown and that its `status` property is `404`.

*   **How to Fail the Test:** If the error handling logic in `sendPushNotification` is changed to not throw an error on a 4xx status code, this test will fail.

### Test Case 3: Push Service Error - Server Error

*   **Purpose:** To ensure the function handles server-side errors from the push service gracefully.
*   **Proposed Solution:**
    1.  Start a mock HTTP server configured to respond with a `500 Internal Server Error` status.
    2.  Call `sendPushNotification` with the `endpoint` pointing to the mock server.
    3.  Use `assert.rejects` to verify that a `PushServerError` is thrown with a `status` property of `500`.

*   **How to Fail the Test:** Any change that prevents the function from throwing on a 500-range status code will fail this test.

### Test Case 4: Invalid Input - Malformed Subscription

*   **Purpose:** To verify that the function throws an error when the `subscription` object is missing required properties before any network request is made.
*   **Proposed Solution:**
    1.  Call `sendPushNotification` with a `subscription` object that is missing the `keys` property.
    2.  Use `assert.rejects` to ensure that the function throws an error (e.g., a `TypeError`) without attempting a network call.

*   **How to Fail the Test:** Removing the input validation (implicit or explicit) for the `subscription.keys` object would cause this test to fail.

### Test Case 5: Invalid Input - Malformed VAPID Credentials

*   **Purpose:** To verify that the function fails when the `vapid` object contains invalid credentials before any network request is made.
*   **Proposed Solution:**
    1.  Call `sendPushNotification` with a `vapid` object that is missing the `privateKey` property.
    2.  Use `assert.rejects` to check for an appropriate error, which should be thrown during the JWT signing process.

*   **How to Fail the Test:** If the `createVapidJwt` function no longer requires the `privateKey`, this test would fail.

## 4. Readability and Maintainability

To ensure the tests are easy to understand and maintain, we will follow these best practices:

*   **Descriptive Test Names:** Each test will have a clear and descriptive name, such as `it('should throw PushServerError on 404 response')`.
*   **Arrange-Act-Assert Pattern:** Tests will be structured following the AAA pattern to clearly separate test setup, execution, and verification.
*   **Test Data Management:** Common test data will be defined in a shared location to avoid duplication.
*   **Clear Assertions:** Each test should ideally have a single, clear assertion. If multiple assertions are needed, they should be closely related to the test's purpose.
