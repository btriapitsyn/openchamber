
import { OPENCHAMBER_SDK_API_VERSION, OPENCHAMBER_SDK_CHANNEL } from './api-version.ts';

export type HostThemeMode = 'light' | 'dark';

export type HostThemeTokens = {
  background: string;
  elevated: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  hover: string;
  selection: string;
  focus: string;
  primary: string;
  /** Secondary surface (sidebars, muted rows). */
  mutedSurface: string;
  /** Text on `elevated`. */
  elevatedForeground: string;
  /** Pressed state of a clickable. */
  active: string;
  /** Text on `selection`. */
  selectionForeground: string;
  /** Text on `primary`. */
  primaryForeground: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  font: string;
  /** Monospace stack for code and identifiers. */
  mono: string;
  radius: string;
};

export type HostTheme = {
  mode: HostThemeMode;
  tokens: HostThemeTokens;
};

export const START_SESSION_SENT = ['sent', 'no-model', 'skipped', 'failed'] as const;

export type StartSessionSent = (typeof START_SESSION_SENT)[number];

export type SessionSnapshot = {
  id: string;
  title: string;
  busy: boolean;
  model?: string;
  agent?: string;
};

/** Which host chrome mounted this iframe. Not `openSurface`. */
export type GuestHostSurface = 'panel' | 'dialog';

export type GuestConnection = {
  connected: boolean;
  account: string;
};

export type GuestSettings = Record<string, string>;

export type GuestRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type GuestRequest = {
  method: GuestRequestMethod;
  path: string;
  query?: Record<string, string>;
  body?: string;
};

export type GuestRequestResult = {
  status: number;
  body: string;
};

export type StartSessionResult = {
  sessionId: string;
  sent: StartSessionSent;
};

export type PromptRequest = {
  text: string;
  send?: boolean;
};

export type PromptResult = {
  sent: StartSessionSent;
};

export const SESSION_LIFECYCLE_PHASES = ['started', 'completed', 'failure'] as const;

export type SessionLifecyclePhase = (typeof SESSION_LIFECYCLE_PHASES)[number];

export type SessionLifecycleEvent = {
  sessionId: string;
  phase: SessionLifecyclePhase;
};

export type HostResultPayload =
  | GuestRequestResult
  | StartSessionResult
  | PromptResult
  | ServiceStatusResult;

export const isStartSessionResult = (
  value: HostResultPayload | undefined,
): value is StartSessionResult => Boolean(value && 'sessionId' in value);

export const isPromptResult = (
  value: HostResultPayload | undefined,
): value is PromptResult => Boolean(value && 'sent' in value && !('sessionId' in value));

export const EMPTY_GUEST_CONNECTION: GuestConnection = {
  connected: false,
  account: '',
};

export type HostReadyContext = {
  theme: HostTheme;
  locale: string;
  directory: string | null;
  session: SessionSnapshot | null;
  surface: GuestHostSurface;
  connection: GuestConnection;
  settings: GuestSettings;
};

export type ToastKind = 'info' | 'success' | 'error';

export type ToastRequest = {
  kind: ToastKind;
  message: string;
};

export type ComposeRequest = {
  text: string;
  mode?: 'replace' | 'append';
};

export type AttachThreadKind = 'issue' | 'pull';

export type AttachBranches = {
  head: string;
  base: string;
};

export type AttachIssueRequest = {
  providerId: string;
  id: string;
  title: string;
  url: string;
  text?: string;
  kind?: AttachThreadKind;
  author?: string;
  branches?: AttachBranches;
};

export type StartSessionRequest = AttachIssueRequest & {
  worktree?: boolean;
};

export const GUEST_TOAST_MAX = 500;
export const GUEST_CLIPBOARD_TEXT_MAX = 32_000;
export const GUEST_COMPOSE_TEXT_MAX = 16_000;
export const GUEST_ATTACH_ID_MAX = 128;
export const GUEST_ATTACH_TITLE_MAX = 200;
export const GUEST_ATTACH_URL_MAX = 2_000;
export const GUEST_ATTACH_TEXT_MAX = 16_000;
export const GUEST_ATTACH_AUTHOR_MAX = 80;
export const GUEST_ATTACH_BRANCH_MAX = 200;
export const GUEST_ACCOUNT_MAX = 200;
export const GUEST_SESSION_MODEL_MAX = 200;
export const GUEST_SESSION_AGENT_MAX = 80;
export const GUEST_SETTING_VALUE_MAX = 2_000;
export const GUEST_REQUEST_PATH_MAX = 2_000;
export const GUEST_REQUEST_BODY_MAX = 64_000;
export const GUEST_REQUEST_RESPONSE_MAX = 256_000;
export const GUEST_REQUEST_TIMEOUT_MS = 20_000;

export const HOST_REQUEST_ERROR_CODES = [
  'HOST_UNAVAILABLE',
  'HOST_TIMEOUT',
  'HOST_REJECTED',
  'DISCONNECTED',
  'DISABLED',
  'BAD_PATH',
  'NO_INTEGRATION',
  'NO_SERVICE',
  'SERVICE_FAILED',
  'NO_SESSION',
  'SESSION_BUSY',
  'NOT_GRANTED',
] as const;

export const SERVICE_STATUS_VALUES = ['stopped', 'starting', 'ready', 'failed'] as const;

export type ServiceStatus = (typeof SERVICE_STATUS_VALUES)[number];

export type ServiceStatusResult = {
  status: ServiceStatus;
};

export type HostRequestErrorCode = (typeof HOST_REQUEST_ERROR_CODES)[number];

const hostRequestErrorCodeSet: ReadonlySet<string> = new Set(HOST_REQUEST_ERROR_CODES);

export const isHostRequestErrorCode = (value: string): value is HostRequestErrorCode => (
  hostRequestErrorCodeSet.has(value)
);

/** Unknown or omitted wire codes become HOST_REJECTED. */
export const resolveHostRequestErrorCode = (value: string | undefined): HostRequestErrorCode => (
  value && isHostRequestErrorCode(value) ? value : 'HOST_REJECTED'
);

const clampBranch = (value: string | undefined): string => (
  value?.trim().slice(0, GUEST_ATTACH_BRANCH_MAX) ?? ''
);

/** Guest attach is dropped by the host schema if these limits overflow. */
export const clampAttachRequest = (request: AttachIssueRequest): AttachIssueRequest => {
  const id = request.id.trim().slice(0, GUEST_ATTACH_ID_MAX);
  const title = request.title.trim().slice(0, GUEST_ATTACH_TITLE_MAX);
  const url = request.url.trim().slice(0, GUEST_ATTACH_URL_MAX);
  const text = request.text?.trim().slice(0, GUEST_ATTACH_TEXT_MAX);
  const author = request.author?.trim().slice(0, GUEST_ATTACH_AUTHOR_MAX);
  const kind: AttachThreadKind = request.kind === 'pull' ? 'pull' : 'issue';
  const next: AttachIssueRequest = {
    providerId: request.providerId.trim(),
    id,
    title: title || id,
    url,
    kind,
  };
  if (text) {
    next.text = text;
  }
  if (author) {
    next.author = author;
  }
  if (kind === 'pull') {
    const head = clampBranch(request.branches?.head);
    const base = clampBranch(request.branches?.base);
    if (head && base) {
      next.branches = { head, base };
    }
  }
  return next;
};

/** Same attach clamp. `worktree` stays only when the guest asked for one. */
export const clampStartSessionRequest = (request: StartSessionRequest): StartSessionRequest => {
  const next: StartSessionRequest = clampAttachRequest(request);
  if (request.worktree) {
    next.worktree = true;
  }
  return next;
};

/** Prompt text uses the compose limit. `send` stays only when the guest asked. */
export const clampPromptRequest = (request: PromptRequest): PromptRequest => {
  const next: PromptRequest = {
    text: request.text.trim().slice(0, GUEST_COMPOSE_TEXT_MAX),
  };
  if (request.send) {
    next.send = true;
  }
  return next;
};

export const ATTACH_PROVIDER_ID = /^[a-z][a-z0-9-]*$/;
export const SETTING_KEY = /^[a-z][a-z0-9-]*$/;

export const isGuestRequestPath = (value: string): boolean => {
  if (!value.startsWith('/') || value.includes('\0') || value.includes('\\') || value.includes('://')) {
    return false;
  }
  if (value.length > GUEST_REQUEST_PATH_MAX) {
    return false;
  }
  const segments = value.split('/');
  return !segments.some((segment) => segment === '.' || segment === '..');
};

// Wire messages. The zod schemas in `protocol.ts` are the host's parse of an
// untrusted guest; these types are the shared contract and protocol.ts asserts
// the two agree at compile time.

type Envelope = {
  channel: typeof OPENCHAMBER_SDK_CHANNEL;
  v: typeof OPENCHAMBER_SDK_API_VERSION;
};

export type HostReadyMessage = Envelope & { type: 'ready'; payload: HostReadyContext };
export type HostDirectoryMessage = Envelope & { type: 'directory'; payload: { directory: string | null } };
export type HostSessionMessage = Envelope & { type: 'session'; payload: { session: SessionSnapshot | null } };
export type HostConnectionMessage = Envelope & { type: 'connection'; payload: { connection: GuestConnection } };
export type HostSettingsMessage = Envelope & { type: 'settings'; payload: { settings: GuestSettings } };
export type HostSessionLifecycleMessage = Envelope & { type: 'session-lifecycle'; payload: SessionLifecycleEvent };
export type HostResultMessage = Envelope & { type: 'result'; id: string } & (
  | { ok: true; payload?: HostResultPayload }
  | { ok: false; error: string; code: HostRequestErrorCode }
);

export type HostMessage =
  | HostReadyMessage
  | HostDirectoryMessage
  | HostSessionMessage
  | HostConnectionMessage
  | HostSettingsMessage
  | HostSessionLifecycleMessage
  | HostResultMessage;

type GuestCall<Type extends string, Payload = never> = Envelope & { type: Type; id: string } & (
  [Payload] extends [never] ? object : { payload: Payload }
);

export type GuestHelloMessage = Envelope & { type: 'hello' };
export type GuestToastMessage = GuestCall<'toast', ToastRequest>;
export type GuestOpenUrlMessage = GuestCall<'open-url', { url: string }>;
export type GuestOpenSurfaceMessage = GuestCall<'open-surface', { surfaceId: string }>;
export type GuestClipboardWriteMessage = GuestCall<'clipboard-write', { text: string }>;
export type GuestComposeMessage = GuestCall<'compose', ComposeRequest>;
export type GuestAttachMessage = GuestCall<'attach', AttachIssueRequest>;
export type GuestStartSessionMessage = GuestCall<'start-session', StartSessionRequest>;
export type GuestPromptMessage = GuestCall<'prompt', PromptRequest>;
export type GuestSessionLinkMessage = GuestCall<'session-link', AttachIssueRequest>;
export type GuestCloseMessage = GuestCall<'close'>;
export type GuestOauthStartMessage = GuestCall<'oauth-start'>;
export type GuestOauthDisconnectMessage = GuestCall<'oauth-disconnect'>;
export type GuestRequestMessage = GuestCall<'request', GuestRequest>;
export type GuestServiceRequestMessage = GuestCall<'service-request', GuestRequest>;
export type GuestServiceStatusMessage = GuestCall<'service-status'>;

export type GuestMessage =
  | GuestHelloMessage
  | GuestToastMessage
  | GuestOpenUrlMessage
  | GuestOpenSurfaceMessage
  | GuestClipboardWriteMessage
  | GuestComposeMessage
  | GuestAttachMessage
  | GuestStartSessionMessage
  | GuestPromptMessage
  | GuestSessionLinkMessage
  | GuestCloseMessage
  | GuestOauthStartMessage
  | GuestOauthDisconnectMessage
  | GuestRequestMessage
  | GuestServiceRequestMessage
  | GuestServiceStatusMessage;

const serviceStatusSet: ReadonlySet<string> = new Set(SERVICE_STATUS_VALUES);

export const isServiceStatusResult = (
  value: HostResultPayload | undefined,
): value is ServiceStatusResult => Boolean(value && 'status' in value && serviceStatusSet.has(String(value.status)) && !('body' in value));

export const isGuestRequestResult = (
  value: HostResultPayload | undefined,
): value is GuestRequestResult => Boolean(value && 'status' in value && 'body' in value && Number.isInteger(value.status));

const HOST_PUSH_TYPES: ReadonlySet<string> = new Set([
  'ready', 'directory', 'session', 'connection', 'settings', 'session-lifecycle',
]);

/** What a postMessage payload may carry before it is read as a host message. */
type WireRecord = {
  channel?: unknown;
  v?: unknown;
  type?: unknown;
  id?: unknown;
  ok?: unknown;
  error?: unknown;
  code?: unknown;
  payload?: unknown;
};

const asWireRecord = (data: MessageEvent['data']): WireRecord | null => (
  Object(data) === data ? data : null
);

const isNonEmptyString = (value: WireRecord[keyof WireRecord]): value is string => (
  String(value) === value && value.length > 0
);

const readResultMessage = (wire: WireRecord): HostResultMessage | null => {
  if (!isNonEmptyString(wire.id)) return null;
  if (wire.ok === true) {
    const message: HostResultMessage = {
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: wire.id,
      ok: true,
    };
    if (Object(wire.payload) === wire.payload) {
      // SAFETY: a trusted host answered an id this client issued; the per-call
      // guards in host.ts (isStartSessionResult and friends) narrow the payload
      // before it reaches a caller.
      message.payload = wire.payload as HostResultPayload;
    }
    return message;
  }
  if (wire.ok === false && isNonEmptyString(wire.error)) {
    return {
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'result',
      id: wire.id,
      ok: false,
      error: wire.error,
      code: resolveHostRequestErrorCode(isNonEmptyString(wire.code) ? wire.code : undefined),
    };
  }
  return null;
};

/**
 * The guest's read of a host message. The host is the trusted parent frame
 * (the client only listens to `event.source === parent`), so this checks the
 * envelope and the discriminant rather than every field, and the guest bundle
 * carries no schema library for it. The host side parses guest input with
 * `guestMessageSchema` in `@openchamber/sdk/schemas`.
 */
export const readHostMessage = (data: MessageEvent['data']): HostMessage | null => {
  const wire = asWireRecord(data);
  if (!wire || wire.channel !== OPENCHAMBER_SDK_CHANNEL || wire.v !== OPENCHAMBER_SDK_API_VERSION) return null;
  if (wire.type === 'result') return readResultMessage(wire);
  if (!HOST_PUSH_TYPES.has(String(wire.type)) || Object(wire.payload) !== wire.payload) return null;
  // SAFETY: envelope and discriminant verified above and the sender is the
  // trusted parent frame; protocol.ts asserts these push shapes against the
  // host's own schema at compile time.
  return wire as HostMessage;
};
