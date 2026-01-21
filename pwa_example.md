# Background Notifications for PWA - Implementation Guide

## Architecture Overview

This implementation uses **Web Push API** combined with **PWA Service Worker** to deliver background notifications on mobile devices.

**Key Components:**
- **VAPID Keys** (Web Push Application Server Authentication)
- **Push Service** (web-push library)
- **Service Worker** (Workbox)
- **Notification Channels** (Push + SSE fallback)
- **Frontend Subscription Manager** (React hook)

---

## 1. Server-Side Implementation

### 1.1 VAPID Key Generation

**Location:** `server/src/config/vapidKeys.ts`

```typescript
import { generateVAPIDKeys } from 'web-push'
import { getOrCreateSettingsValue } from './generators'
import { getSettingsFile } from './settings'

export type VapidKeys = {
    publicKey: string
    privateKey: string
}

export async function getOrCreateVapidKeys(dataDir: string): Promise<VapidKeys> {
    const settingsFile = getSettingsFile(dataDir)
    const result = await getOrCreateSettingsValue({
        settingsFile,
        readValue: (settings) => {
            if (settings.vapidKeys?.publicKey && settings.vapidKeys?.privateKey) {
                return { value: settings.vapidKeys }
            }
            return null
        },
        writeValue: (settings, value) => {
            settings.vapidKeys = value
        },
        generate: () => {
            const generated = generateVAPIDKeys()
            return {
                publicKey: generated.publicKey,
                privateKey: generated.privateKey
            }
        }
    })

    return result.value
}
```

**Process:**
- Keys generated once on startup using `web-push`
- Keys persisted to settings file for later reuse
- Only public key exposed to frontend

---

### 1.2 Push Service

**Location:** `server/src/push/pushService.ts`

```typescript
import * as webPush from 'web-push'

export type PushPayload = {
    title: string
    body: string
    tag?: string
    data?: {
        type: string
        sessionId: string
        url: string
    }
}

export class PushService {
    constructor(
        private readonly vapidKeys: VapidKeys,
        private readonly subject: string,
        private readonly store: Store
    ) {
        webPush.setVapidDetails(this.subject, this.vapidKeys.publicKey, this.vapidKeys.privateKey)
    }

    async sendToNamespace(namespace: string, payload: PushPayload): Promise<void> {
        const subscriptions = this.store.push.getPushSubscriptionsByNamespace(namespace)
        if (subscriptions.length === 0) {
            return
        }

        const body = JSON.stringify(payload)
        await Promise.all(subscriptions.map((subscription) => {
            return this.sendToSubscription(namespace, subscription, body)
        }))
    }

    private async sendToSubscription(
        namespace: string,
        subscription: StoredSubscription,
        body: string
    ): Promise<void> {
        const pushSubscription: PushSubscription = {
            endpoint: subscription.endpoint,
            keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth
            }
        }

        try {
            await webPush.sendNotification(pushSubscription, body)
        } catch (error) {
            const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number'
                ? (error as { statusCode: number }).statusCode
                : null

            if (statusCode === 410) {
                // Subscription expired - remove it
                this.store.push.removePushSubscription(namespace, subscription.endpoint)
                return
            }

            console.error('[PushService] Failed to send notification:', error)
        }
    }
}
```

**Process:**
1. Gets subscriptions from database by namespace
2. Sends notification to all subscribers using web-push
3. Removes subscriptions that return 410 Gone
4. Handles other errors gracefully

---

### 1.3 Push Notification Channel

**Location:** `server/src/push/pushNotificationChannel.ts`

```typescript
import type { Session } from '../sync/syncEngine'
import type { NotificationChannel } from '../notifications/notificationTypes'
import { getAgentName, getSessionName } from '../notifications/sessionInfo'
import type { SSEManager } from '../sse/sseManager'
import type { VisibilityTracker } from '../visibility/visibilityTracker'
import type { PushPayload, PushService } from './pushService'

export class PushNotificationChannel implements NotificationChannel {
    constructor(
        private readonly pushService: PushService,
        private readonly sseManager: SSEManager,
        private readonly visibilityTracker: VisibilityTracker,
        _appUrl: string
    ) {}

    async sendPermissionRequest(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const name = getSessionName(session)
        const request = session.agentState?.requests
            ? Object.values(session.agentState.requests)[0]
            : null
        const toolName = request?.tool ? ` (${request.tool})` : ''

        const payload: PushPayload = {
            title: 'Permission Request',
            body: `${name}${toolName}`,
            tag: `permission-${session.id}`,
            data: {
                type: 'permission-request',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        // Try SSE first (for visible sessions)
        const url = payload.data?.url ?? this.buildSessionPath(session.id)
        if (this.visibilityTracker.hasVisibleConnection(session.namespace)) {
            const delivered = await this.sseManager.sendToast(session.namespace, {
                type: 'toast',
                data: {
                    title: payload.title,
                    body: payload.body,
                    sessionId: session.id,
                    url
                }
            })
            if (delivered > 0) {
                return
            }
        }

        // Fallback to push notification
        await this.pushService.sendToNamespace(session.namespace, payload)
    }

    async sendReady(session: Session): Promise<void> {
        if (!session.active) {
            return
        }

        const agentName = getAgentName(session)
        const name = getSessionName(session)

        const payload: PushPayload = {
            title: 'Ready for input',
            body: `${agentName} is waiting in ${name}`,
            tag: `ready-${session.id}`,
            data: {
                type: 'ready',
                sessionId: session.id,
                url: this.buildSessionPath(session.id)
            }
        }

        // Try SSE first
        const url = payload.data?.url ?? this.buildSessionPath(session.id)
        if (this.visibilityTracker.hasVisibleConnection(session.namespace)) {
            const delivered = await this.sseManager.sendToast(session.namespace, {
                type: 'toast',
                data: {
                    title: payload.title,
                    body: payload.body,
                    sessionId: session.id,
                    url
                }
            })
            if (delivered > 0) {
                return
            }
        }

        // Fallback to push notification
        await this.pushService.sendToNamespace(session.namespace, payload)
    }

    private buildSessionPath(sessionId: string): string {
        return `/sessions/${sessionId}`
    }
}
```

**Strategy:**
- **SSE Priority**: Checks if session is visible in current tab/window (SSE)
- **Push Fallback**: If not visible, sends background notification via VAPID
- **Tagging**: Uses session ID for grouping same-type notifications

---

### 1.4 Notification Hub

**Location:** `server/src/notifications/notificationHub.ts`

```typescript
import type { Session, SyncEvent } from '../sync/syncEngine'
import type { NotificationChannel, NotificationHubOptions } from './notificationTypes'
import { extractMessageEventType } from './eventParsing'

export class NotificationHub {
    private readonly channels: NotificationChannel[]
    private readonly readyCooldownMs: number
    private readonly permissionDebounceMs: number
    private readonly lastKnownRequests: Map<string, Set<string>> = new Map()
    private readonly notificationDebounce: Map<string, NodeJS.Timeout> = new Map()
    private readonly lastReadyNotificationAt: Map<string, number> = new Map()

    constructor(
        private readonly syncEngine: SyncEngine,
        channels: NotificationChannel[],
        options?: NotificationHubOptions
    ) {
        this.channels = channels
        this.readyCooldownMs = options?.readyCooldownMs ?? 5000
        this.permissionDebounceMs = options?.permissionDebounceMs ?? 500
        this.unsubscribeSyncEvents = this.syncEngine.subscribe((event) => {
            this.handleSyncEvent(event)
        })
    }

    private handleSyncEvent(event: SyncEvent): void {
        // Permission notifications
        if ((event.type === 'session-updated' || event.type === 'session-added') && event.sessionId) {
            const session = this.syncEngine.getSession(event.sessionId)
            if (!session || !session.active) {
                this.clearSessionState(event.sessionId)
                return
            }
            this.checkForPermissionNotification(session)
            return
        }

        if (event.type === 'session-removed' && event.sessionId) {
            this.clearSessionState(event.sessionId)
            return
        }

        // Ready notifications
        if (event.type === 'message-received' && event.sessionId) {
            const eventType = extractMessageEventType(event)
            if (eventType === 'ready') {
                this.sendReadyNotification(event.sessionId).catch((error) => {
                    console.error('[NotificationHub] Failed to send ready notification:', error)
                })
            }
        }
    }

    private checkForPermissionNotification(session: Session): void {
        const requests = session.agentState?.requests

        if (requests == null) {
            return
        }

        const newRequestIds = new Set(Object.keys(requests))
        const oldRequestIds = this.lastKnownRequests.get(session.id) || new Set()

        let hasNewRequests = false
        for (const requestId of newRequestIds) {
            if (!oldRequestIds.has(requestId)) {
                hasNewRequests = true
                break
            }
        }

        this.lastKnownRequests.set(session.id, newRequestIds)

        if (!hasNewRequests) {
            return
        }

        // Debounce permission notifications
        const existingTimer = this.notificationDebounce.get(session.id)
        if (existingTimer) {
            clearTimeout(existingTimer)
        }

        const timer = setTimeout(() => {
            this.notificationDebounce.delete(session.id)
            this.sendPermissionNotification(session.id).catch((error) => {
                console.error('[NotificationHub] Failed to send permission notification:', error)
            })
        }, this.permissionDebounceMs)

        this.notificationDebounce.set(session.id, timer)
    }

    private clearSessionState(sessionId: string): void {
        const existingTimer = this.notificationDebounce.get(sessionId)
        if (existingTimer) {
            clearTimeout(existingTimer)
            this.notificationDebounce.delete(sessionId)
        }
        this.lastKnownRequests.delete(sessionId)
        this.lastReadyNotificationAt.delete(sessionId)
    }

    private getNotifiableSession(sessionId: string): Session | null {
        const session = this.syncEngine.getSession(sessionId)
        if (!session || !session.active) {
            return null
        }
        return session
    }
}
```

**Features:**
- **Event-Based**: Listens to sync events from SyncEngine
- **Debouncing**:
  - Permission requests: 500ms debounce
  - Ready notifications: 5s cooldown
- **State Tracking**: Remembers last-known requests to detect new ones
- **Multi-Channel**: Forwards to all registered channels

---

### 1.5 Subscription Storage

**Location:** `server/src/store/pushSubscriptions.ts`

```typescript
import type { Database } from 'bun:sqlite'
import type { StoredPushSubscription } from './types'

type DbPushSubscriptionRow = {
    id: number
    namespace: string
    endpoint: string
    p256dh: string
    auth: string
    created_at: number
}

export function addPushSubscription(
    db: Database,
    namespace: string,
    subscription: { endpoint: string; p256dh: string; auth: string }
): void {
    const now = Date.now()
    db.prepare(`
        INSERT INTO push_subscriptions (
            namespace, endpoint, p256dh, auth, created_at
        ) VALUES (
            @namespace, @endpoint, @p256dh, @auth, @created_at
        )
        ON CONFLICT(namespace, endpoint)
        DO UPDATE SET
            p256dh = excluded.p256dh,
            auth = excluded.auth,
            created_at = excluded.created_at
    `).run({
        namespace,
        endpoint: subscription.endpoint,
        p256dh: subscription.p256dh,
        auth: subscription.auth,
        created_at: now
    })
}

export function removePushSubscription(db: Database, namespace: string, endpoint: string): void {
    db.prepare(
        'DELETE FROM push_subscriptions WHERE namespace = ? AND endpoint = ?'
    ).run(namespace, endpoint)
}

export function getPushSubscriptionsByNamespace(
    db: Database,
    namespace: string
): StoredPushSubscription[] {
    const rows = db.prepare(
        'SELECT * FROM push_subscriptions WHERE namespace = ? ORDER BY created_at DESC'
    ).all(namespace) as DbPushSubscriptionRow[]
    return rows.map(toStoredPushSubscription)
}
```

**Storage Strategy:**
- SQLite database with namespace-based isolation
- Upsert on duplicate (updates keys if same endpoint)
- Timestamps for ordering

---

### 1.6 Push API Routes

**Location:** `server/src/web/routes/push.ts`

```typescript
import { Hono } from 'hono'
import { z } from 'zod'
import type { Store } from '../../store'
import type { WebAppEnv } from '../middleware/auth'

const subscriptionSchema = z.object({
    endpoint: z.string().min(1),
    keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1)
    })
})

const unsubscribeSchema = z.object({
    endpoint: z.string().min(1)
})

export function createPushRoutes(store: Store, vapidPublicKey: string): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/push/vapid-public-key', (c) => {
        return c.json({ publicKey: vapidPublicKey })
    })

    app.post('/push/subscribe', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = subscriptionSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        const { endpoint, keys } = parsed.data
        store.push.addPushSubscription(namespace, {
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth
        })

        return c.json({ ok: true })
    })

    app.delete('/push/subscribe', async (c) => {
        const json = await c.req.json().catch(() => null)
        const parsed = unsubscribeSchema.safeParse(json)
        if (!parsed.success) {
            return c.json({ error: 'Invalid body' }, 400)
        }

        const namespace = c.get('namespace')
        store.push.removePushSubscription(namespace, parsed.data.endpoint)
        return c.json({ ok: true })
    })

    return app
}
```

**API Endpoints:**
- `GET /push/vapid-public-key` - Exposes VAPID public key
- `POST /push/subscribe` - Register push subscription
- `DELETE /push/subscribe` - Unsubscribe

---

### 1.7 Service Worker

**Location:** `web/src/sw.ts`

```typescript
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

declare const self: ServiceWorkerGlobalScope & {
    __WB_MANIFEST: Array<string | { url: string; revision?: string }>
}

type PushPayload = {
    title: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: {
        type?: string
        sessionId?: string
        url?: string
    }
}

precacheAndRoute(self.__WB_MANIFEST)

// Cache API responses
registerRoute(
    ({ url }) => url.pathname === '/api/sessions',
    new NetworkFirst({
        cacheName: 'api-sessions',
        networkTimeoutSeconds: 10,
        plugins: [
            new ExpirationPlugin({
                maxEntries: 10,
                maxAgeSeconds: 60 * 5
            })
        ]
    })
)

// Handle push notifications
self.addEventListener('push', (event) => {
    const payload = event.data?.json() as PushPayload | undefined
    if (!payload) {
        return
    }

    const title = payload.title || 'HAPI'
    const body = payload.body ?? ''
    const icon = payload.icon ?? '/pwa-192x192.png'
    const badge = payload.badge ?? '/pwa-64x64.png'
    const data = payload.data
    const tag = payload.tag

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon,
            badge,
            data,
            tag
        })
    )
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const data = event.notification.data as { url?: string } | undefined
    const url = data?.url ?? '/'
    event.waitUntil(self.clients.openWindow(url))
})
```

**Features:**
- Uses Workbox for caching strategies
- Push event handler: Shows notification with custom payload
- Click handler: Opens app at specific URL (deep linking)

---

## 2. Frontend Implementation

### 2.1 React Hook for Push Management

**Location:** `web/src/hooks/usePushNotifications.ts`

```typescript
import { useCallback, useEffect, useState } from 'react'
import type { ApiClient } from '@/api/client'

function isPushSupported(): boolean {
    return typeof window !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
    const base64 = (base64Url + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/')
    const raw = atob(base64)
    const output = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i += 1) {
        output[i] = raw.charCodeAt(i)
    }
    return output
}

export function usePushNotifications(api: ApiClient | null) {
    const [isSupported, setIsSupported] = useState(false)
    const [permission, setPermission] = useState<NotificationPermission>('default')
    const [isSubscribed, setIsSubscribed] = useState(false)

    const refreshSubscription = useCallback(async () => {
        if (!isPushSupported()) {
            setIsSupported(false)
            setIsSubscribed(false)
            return
        }

        setIsSupported(true)
        setPermission(Notification.permission)

        if (Notification.permission !== 'granted') {
            setIsSubscribed(false)
            return
        }

        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        setIsSubscribed(Boolean(subscription))
    }, [])

    useEffect(() => {
        void refreshSubscription()
    }, [refreshSubscription])

    const requestPermission = useCallback(async (): Promise<boolean> => {
        if (!isPushSupported()) {
            return false
        }

        const result = await Notification.requestPermission()
        setPermission(result)
        if (result !== 'granted') {
            setIsSubscribed(false)
        }
        return result === 'granted'
    }, [])

    const subscribe = useCallback(async (): Promise<boolean> => {
        if (!api || !isPushSupported()) {
            return false
        }

        if (Notification.permission !== 'granted') {
            setPermission(Notification.permission)
            return false
        }

        try {
            const registration = await navigator.serviceWorker.ready
            const existing = await registration.pushManager.getSubscription()
            const { publicKey } = await api.getPushVapidPublicKey()
            const applicationServerKey = base64UrlToUint8Array(publicKey).buffer as ArrayBuffer
            const subscription = existing ?? await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            })

            const json = subscription.toJSON()
            const keys = json.keys
            if (!json.endpoint || !keys?.p256dh || !keys.auth) {
                return false
            }

            await api.subscribePushNotifications({
                endpoint: json.endpoint,
                keys: {
                    p256dh: keys.p256dh,
                    auth: keys.auth
                }
            })
            setIsSubscribed(true)
            return true
        } catch (error) {
            console.error('[PushNotifications] Failed to subscribe:', error)
            return false
        }
    }, [api])

    const unsubscribe = useCallback(async (): Promise<boolean> => {
        if (!api || !isPushSupported()) {
            return false
        }

        try {
            const registration = await navigator.serviceWorker.ready
            const subscription = await registration.pushManager.getSubscription()
            if (!subscription) {
                setIsSubscribed(false)
                return true
            }

            const endpoint = subscription.endpoint
            const success = await subscription.unsubscribe()
            await api.unsubscribePushNotifications({ endpoint })
            setIsSubscribed(false)
            return success
        } catch (error) {
            console.error('[PushNotifications] Failed to unsubscribe:', error)
            return false
        }
    }, [api])

    return {
        isSupported,
        permission,
        isSubscribed,
        requestPermission,
        subscribe,
        unsubscribe
    }
}
```

**Process:**
1. Check browser support
2. Request permission on user action
3. Subscribe using PushManager with VAPID key
4. Send subscription details to server
5. Unsubscribe by removing subscription

---

### 2.2 PWA Configuration

**Location:** `web/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'node:path'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'mask-icon.svg'],
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            manifest: {
                name: 'HAPI',
                short_name: 'HAPI',
                description: 'AI-powered development assistant',
                theme_color: '#ffffff',
                background_color: '#ffffff',
                display: 'standalone',
                orientation: 'portrait',
                scope: base,
                start_url: base,
                icons: [
                    {
                        src: 'pwa-64x64.png',
                        sizes: '64x64',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    },
                    {
                        src: 'maskable-icon-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'maskable'
                    }
                ]
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}']
            },
            devOptions: {
                enabled: true,
                type: 'module'
            }
        })
    ],
    // ...
})
```

**Configuration:**
- **Auto-update**: Service worker auto-updates every load
- **Manifest**: Defines PWA metadata and icons
- **Icons**: Multiple sizes including maskable

---

### 2.3 Service Worker Registration

**Location:** `web/src/main.tsx`

```typescript
import { registerSW } from 'virtual:pwa-register'

async function bootstrap() {
    // ... other initialization

    const updateSW = registerSW({
        onNeedRefresh() {
            if (confirm('New version available! Reload to update?')) {
                updateSW(true)
            }
        },
        onOfflineReady() {
            console.log('App ready for offline use')
        },
        onRegistered(registration) {
            if (registration) {
                // Auto-update every hour
                setInterval(() => {
                    registration.update()
                }, 60 * 60 * 1000)
            }
        },
        onRegisterError(error) {
            console.error('SW registration error:', error)
        }
    })

    // ...
}

bootstrap()
```

---

### 2.4 App Integration

**Location:** `web/src/App.tsx`

```typescript
const { isSupported: isPushSupported, permission: pushPermission, requestPermission, subscribe } = usePushNotifications(api)

useEffect(() => {
    if (!api || !token) {
        pushPromptedRef.current = false
        return
    }
    if (isTelegramApp() || !isPushSupported) {
        return
    }
    if (pushPromptedRef.current) {
        return
    }
    pushPromptedRef.current = true

    const run = async () => {
        if (pushPermission === 'granted') {
            await subscribe()
            return
        }
        if (pushPermission === 'default') {
            const granted = await requestPermission()
            if (granted) {
                await subscribe()
            }
        }
    }

    void run()
}, [api, isPushSupported, pushPermission, requestPermission, subscribe, token])
```

**Strategy:**
- Prompt user for permission once per session
- Auto-subscribe if permission granted
- Don't prompt in Telegram environment (uses built-in notifications)

---

## 3. Full Data Flow

### 3.1 Subscription Flow

```
User action (App.tsx)
    ↓
requestPermission() (usePushNotifications.ts)
    ↓
Browser prompt
    ↓
User approves → Notification.permission = 'granted'
    ↓
subscribe() (usePushNotifications.ts)
    ↓
navigator.serviceWorker.ready
    ↓
registration.pushManager.subscribe()
    ↓
Get subscription keys (endpoint, p256dh, auth)
    ↓
POST /api/push/subscribe (api.client.ts)
    ↓
Server stores in database (pushSubscriptions.ts)
```

---

### 3.2 Notification Delivery Flow

```
Event occurs (session state change)
    ↓
NotificationHub.handleSyncEvent()
    ↓
checkForPermissionNotification() / sendReadyNotification()
    ↓
NotificationHub.notifyPermission() / notifyReady()
    ↓
PushNotificationChannel.sendPermissionRequest() / sendReady()
    ↓
Check visibility (VisibilityTracker)
    ↓
    ├─ Visible → SSE toast (immediate)
    ↓
    └─ Not visible → Push notification
        ↓
    PushService.sendToNamespace()
        ↓
    Get subscriptions from DB
        ↓
    web-push.sendNotification()
        ↓
    Device receives push
        ↓
    Service Worker push event
    ↓
    showNotification() (sw.ts)
    ↓
    User sees notification
    ↓
    Click handler opens app
```

---

## 4. Key Implementation Details

### 4.1 VAPID Authentication

```typescript
// Server
webPush.setVapidDetails(
    subject,           // mailto:admin@hapi.run
    publicKey,         // From getOrCreateVapidKeys()
    privateKey         // From getOrCreateVapidKeys()
)

// Frontend
const { publicKey } = await api.getPushVapidPublicKey()
const applicationServerKey = base64UrlToUint8Array(publicKey).buffer
```

**Why VAPID:**
- Validates sender (prevents spam)
- Required for service worker push to work
- Uses asymmetric crypto (public/private key pair)

---

### 4.2 Tagging Strategy

```typescript
{
    title: 'Ready for input',
    tag: `ready-${session.id}`,  // Group notifications
    data: {
        type: 'ready',
        sessionId: session.id,
        url: '/sessions/123'
    }
}
```

**Benefits:**
- Same-type notifications combine into single item
- User can dismiss all similar notifications at once
- Deep linking via URL

---

### 4.3 Error Handling

```typescript
// Service worker
self.addEventListener('push', (event) => {
    event.waitUntil(
        self.registration.showNotification(title, options)
    )
})

// Push service
try {
    await webPush.sendNotification(pushSubscription, body)
} catch (error) {
    if (statusCode === 410) {
        removeSubscription()  // Subscription expired
    }
}
```

---

### 4.4 Database Schema

```sql
CREATE TABLE push_subscriptions (
    id INTEGER PRIMARY KEY,
    namespace TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
```

---

## 5. Testing Checklist

### Server-side
- [ ] VAPID keys generated correctly
- [ ] Subscription stored in DB
- [ ] Notification sent to valid subscription
- [ ] 410 Gone handled (remove expired subscriptions)
- [ ] Routes return proper error codes

### Frontend
- [ ] Push supported check works
- [ ] Permission request triggered correctly
- [ ] Subscription created with correct keys
- [ ] Keys sent to server
- [ ] Unsubscribe works
- [ ] Deep linking opens correct URL

### Integration
- [ ] Permission notification sent when new request appears
- [ ] Ready notification sent after AI responds
- [ ] Debouncing prevents spam
- [ ] Fallback to SSE when visible
- [ ] Push used when not visible

---

## 6. Common Pitfalls

1. **VAPID Key Mismatch** - Frontend public key must match server private key
2. **Wrong Content-Type** - Push payload must be string (not JSON object)
3. **Missing Icon** - Notification needs icon to display correctly
4. **Service Worker Not Registered** - Hook checks for support but SW may fail to load
5. **PushManager Not Available** - Some browsers block push in non-HTTPS contexts
6. **Database Connection** - Store must be initialized before creating subscription routes

---

## 7. Recommendations for Your Project

1. **Add clear permission prompt** - Don't auto-prompt on load, wait for user action
2. **Include icons** - Notification needs 192x192+ icon and optional badge
3. **Handle location** - Use `tag` to group notifications
4. **Test on real device** - Most browsers require HTTPS and device support for push
5. **Fallback to in-app** - Always try SSE/Socket.IO first, use push as fallback
6. **Clear error messages** - Show why push failed (permission, support, etc.)
7. **Debounce events** - Prevent notification spam with 500ms-5s delays

---

## Summary

This implementation uses a robust, production-ready approach combining:

- **VAPID Authentication** for secure push delivery
- **Workbox Service Worker** for caching and notification handling
- **Hybrid Delivery** (SSE first, push fallback) for optimal UX
- **Debouncing & Cooldown** to prevent spam
- **Database Persistence** for subscription management
- **Deep Linking** for seamless user experience

The architecture is modular and extensible, making it easy to add more notification channels (Telegram, Slack, etc.) without changing core logic.
