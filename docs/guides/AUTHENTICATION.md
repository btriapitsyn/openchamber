# Basic Session-Based Authentication for OpenChamber

This document outlines a proposal for implementing a basic, single-password authentication mechanism for the OpenChamber. The goal is to provide a simple layer of security without full user management, similar to `code-server`'s password protection.

## Core Principles

*   **Single Password**: A single, pre-configured password protects access to the OpenChamber.
*   **No User Management**: There are no user accounts, registration, or password reset functionalities.
*   **Session-Based**: Authentication relies on a server-issued session cookie to maintain user sessions.
*   **Conditional Activation**: The authentication challenge is only presented if a specific environment variable (e.g., `OPENCODE_PASSWORD`) is set during server startup. If not set, the OpenChamber remains publicly accessible.

## Implementation Details

### 1. Server-Side (Express.js)

The server-side implementation will handle password verification, session creation, and access control.

*   **Password Configuration**:
    *   Upon server startup, check for the presence of an environment variable, for example, `OPENCODE_PASSWORD`.
    *   If `OPENCODE_PASSWORD` is set, the server will hash this password (e.g., using `bcrypt`) and store the hash securely. This hash will be used for comparison during login attempts.
    *   If `OPENCODE_PASSWORD` is *not* set, the authentication middleware will be bypassed, and the OpenChamber will be accessible without a password.

*   **Login Route (`/login`)**:
    *   A dedicated POST endpoint (`/login`) will accept a password from the client.
    *   The submitted password will be compared against the stored hash.
    *   On successful verification, the server will generate a secure session token (e.g., a cryptographically secure random string or a JWT).
    *   This token will be set as an `HttpOnly` cookie in the response. This prevents client-side JavaScript from accessing the cookie, enhancing security.

*   **Authentication Middleware**:
    *   A middleware function will be applied to all routes that require authentication.
    *   This middleware will check for the presence and validity of the session cookie.
    *   If the cookie is valid, the request proceeds.
    *   If the cookie is missing or invalid, the request will be redirected to the login page.

### 2. Client-Side (React)

The client-side will provide a simple interface for password submission.

*   **Login Page**:
    *   A minimal login page will be created, featuring a single input field for the password. No username field will be displayed.
    *   This page will only be rendered if the server indicates that authentication is required (e.g., by redirecting to `/login`).

*   **Authentication Flow**:
    *   When the user submits the password, it will be sent to the server's `/login` endpoint.
    *   Upon a successful response (indicating the session cookie has been set), the client will redirect to the main application interface.
    *   The client-side application can use a state management solution (e.g., `useSessionStore` or a dedicated React Context) to track the authentication status and conditionally render protected content or the login page.

## Security Considerations

*   **Password Hashing**: Always hash the configured password on the server using a strong, modern hashing algorithm (e.g., `bcrypt`) to protect against brute-force attacks and database breaches.
*   **`HttpOnly` Cookies**: Using `HttpOnly` cookies prevents cross-site scripting (XSS) attacks from accessing the session token.
*   **`Secure` Cookies**: While HTTPS is assumed to be handled by the user's infrastructure (e.g., Cloudflare, Nginx proxy), if the server were ever to directly serve over HTTPS, the `Secure` flag should be used for cookies to ensure they are only sent over encrypted connections.
*   **Token Expiration**: Session tokens should have a reasonable expiration time to limit the window of opportunity for session hijacking.
*   **Rate Limiting**: Implement rate limiting on the `/login` endpoint to mitigate brute-force password guessing attempts.

## CLI Integration

The server's startup script (e.g., `server/index.js`) will be responsible for checking the `OPENCODE_PASSWORD` environment variable. If this variable is present, the authentication system will be initialized and enforced. If it's absent, the OpenChamber will start in an unauthenticated mode.

## Implementation Status

**Status: Implemented**

The basic session-based authentication system has been implemented as described in this document.

### How to Use

1.  **Install Dependencies**:
    Ensure you have installed the new dependencies by running `npm install` in the project's root directory. This will install `bcrypt`, `express-session`, and `cookie-parser`.

2.  **Enable Authentication (with password)**:
    To start the server with authentication enabled, set the `OPENCODE_PASSWORD` environment variable when running the start script:
    ```bash
    OPENCODE_PASSWORD=your_secret_password npm run start
    ```
    Replace `your_secret_password` with your desired password. When you access the OpenChamber, you will be prompted with a login page.

3.  **Disable Authentication (public access)**:
    To run the server without authentication, simply start it without the `OPENCODE_PASSWORD` environment variable:
    ```bash
    npm run start
    ```
    The OpenChamber will be publicly accessible without a login prompt.

### Key Implementation Points

*   **Server-Side**: The `server/index.js` file now includes all necessary logic for handling the `OPENCODE_PASSWORD` environment variable, hashing the password, managing sessions with `express-session`, and protecting routes. It also exposes `/login`, `/logout`, and `/auth-status` endpoints.
*   **Client-Side**: A new `LoginPage.tsx` component has been created in `src/components/ui/`. The main `App.tsx` file has been updated to check the `/auth-status` endpoint on load and will conditionally render either the `LoginPage` or the main application layout based on the authentication state.
