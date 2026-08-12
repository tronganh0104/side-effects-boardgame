# Chat Panel — Design

Date: 2026-08-11
Status: approved, ready to implement

## Purpose

Give players a way to talk to each other inside a room, in the lobby and during a
match. Chat is the foundation for the card-trading feature that comes next: the
message model is a discriminated union from day one, so a structured trade offer
becomes a new `kind` rather than a rewrite.

The rulebook already sanctions this. `side-effects-luat-choi.html` says players may
trade cards or strike deals with anyone at any time, including during someone
else's turn, and that deals are non-binding. Negotiation is public, so chat is
room-wide with no private messages.

## Out of scope

Voice chat, the trade mechanic itself, private/direct messages, emoji picker,
typing indicators, message editing or deletion, moderation tooling.

Voice chat is a separate project: WebRTC mesh, socket signalling, ICE, a TURN
server for symmetric-NAT peers (real infrastructure cost), mic permissions,
push-to-talk, per-player mute. It shares no code with text chat and cannot carry
structured trade offers. Order of work: text chat → trade → voice. This design
leaves room in the panel layout for a future voice control strip and keeps
components small enough that voice will not force a chat rewrite.

## Decisions and their reasons

### History lives in browser memory only

The server is a pure relay: it validates an inbound message, stamps it, and
broadcasts it. It stores nothing.

Consequences, accepted deliberately:

- A page reload wipes that player's history. Other players keep theirs. Histories
  diverge per client; there is no source of truth for chat.
- A transient network drop does *not* lose history: socket.io reconnects without
  remounting React, so the store survives. Only a reload clears it.
- Messages sent while a player is disconnected are lost to them. There is no
  replay. A late joiner sees nothing sent before they joined.
- History is uncapped. With no server-side array, an unbounded history costs
  nothing on the server.

### Rate limiting is the only server-side bound

Because nothing is stored, rate limiting exists to stop one client from flooding
the other clients' DOM, not to protect server memory.

Token bucket per socket: burst 5, refill 1 per second. A hard
one-message-per-500ms gate was rejected — typing three short lines in a row is
normal behaviour and blocking it reads as a bug. Steady state is still 1/s.

The bucket map is the entire server-side chat state. It is released on
`disconnect`.

### Delta broadcast, not full-array resend

The existing game log re-emits the whole array on every change
(`io.to(room.id).emit('game:log', room.gameLog)`), which is safe only because it
is `.slice(-30)`. Chat emits one message per event, so broadcast cost is O(1)
regardless of how long a client's history has grown.

### The sender receives its own message from the server

No optimistic update. A player sees their own message after one round trip. The
trade-off is deliberate: one authority for ordering and identity, and no
reconciliation between a locally guessed message and the server's version. If the
latency is later judged unacceptable, the fix is optimistic append plus dedupe by
`id` — but that complexity is not paid for up front.

### Author identity comes from the session, never the payload

`author` is resolved server-side from the socket's active session. A client that
puts `author` or `playerId` in the payload is ignored. This is impersonation
prevention, not a preference.

`author` is stored as a snapshot rather than a bare `playerId` because history is
client-side and a sender can leave the room. Looking the name up in
`room.players` later would yield `undefined`; the snapshot keeps old messages
rendering correctly.

`id` and `sentAt` are server-generated for the same reason: a client-supplied id
or timestamp lets a client forge ordering.

### No room-status gate

Chat is available in `lobby`, `playing`, and `finished`. The only requirement is
an active session in the room. This follows the rulebook: negotiation at any time.

### Online only

Local mode is hot-seat on one machine. There are no peers to talk to, so no chat.

## Shared contract

Both the server and the client compile against this file. It is written once and
imported by both sides.

`server/chat/types.ts`:

```ts
export const CHAT_TEXT_MAX_LENGTH = 300

export interface ChatAuthor {
  playerId: string
  displayName: string
}

export interface ChatTextMessage {
  kind: 'text'
  id: string
  author: ChatAuthor
  sentAt: number
  text: string
}

/** A union from the start: the trade feature adds `ChatTradeOfferMessage` here
 *  and a matching branch in ChatMessageItem, touching nothing else. */
export type ChatMessage = ChatTextMessage
```

Socket events:

| Event | Direction | Payload |
| --- | --- | --- |
| `chat:send` | client → server | `{ text: string }` |
| `chat:message` | server → every socket in the room | `ChatMessage` |

Errors reuse the existing `game:error` channel (a plain string, English, matching
the other server messages).

## Server

### `server/chat/types.ts`

The contract above. No logic.

### `server/chat/parseChatPayload.ts`

```ts
export function parseChatSendPayload(payload: unknown): { text: string }
```

Rejects a non-object payload, a missing or non-string `text`, an empty or
whitespace-only `text`, and a `text` longer than `CHAT_TEXT_MAX_LENGTH`. Mirrors
the `requireRecord` / `requireString` style already used in
`server/socket/registerSocketHandlers.ts`. Returns the trimmed text.

### `server/chat/rateLimiter.ts`

```ts
export const CHAT_BURST = 5
export const CHAT_REFILL_PER_SECOND = 1

export interface TokenBucket {
  tokens: number
  lastRefillAt: number
}

export function createBucket(now: number): TokenBucket
export function tryConsume(bucket: TokenBucket, now: number): boolean
```

`now` is a parameter, never read from `Date.now()` inside these functions, so the
tests are deterministic without fake timers.

### `server/chat/chatGateway.ts`

```ts
export function createChatGateway(deps: {
  io: Server
  rooms: RoomService
  now?: () => number
  createId?: () => string
}): {
  attach(
    socket: Socket,
    activeSession: () => { roomId: string; playerId: string },
    fail: (error: unknown) => void,
  ): void
  release(socketId: string): void
}
```

Owns the `Map<socketId, TokenBucket>`. `attach` registers the `chat:send`
listener; `release` drops the bucket. `now` and `createId` are injectable so
tests can pin both (default `Date.now` and `crypto.randomUUID`).

On `chat:send`:

1. `activeSession()` — throws if the socket has no live session.
2. `parseChatSendPayload(payload)`.
3. `tryConsume` — on failure emit `game:error` with
   `'You are sending messages too quickly.'` to that socket only, and stop.
4. Resolve `displayName` from the room's player record for `session.playerId`.
5. `io.to(session.roomId).emit('chat:message', message)` — includes the sender.

Any thrown error goes through the supplied `fail`.

### Wiring

`registerSocketHandlers` creates the gateway once, calls `attach` inside
`io.on('connection')` alongside the other listeners, and calls `release(socket.id)`
in the existing `disconnect` handler. Chat logic does not live in
`registerSocketHandlers.ts`, which is already 295 lines.

## Client

### `src/store/chatStore.ts`

```ts
interface ChatStore {
  messages: ChatMessage[]
  unreadCount: number
  isCollapsed: boolean      // desktop sidebar only
  append: (message: ChatMessage) => void
  markRead: () => void
  toggleCollapsed: () => void
  reset: () => void
}
```

Zustand, matching the existing `gameStore`. Uncapped `messages`. `reset()` runs on
`room:left`. Lives in a store rather than `OnlineLobby` state because chat must
survive the lobby → in-game transition, and `OnlineLobby.tsx` is already 11 KB.

The mobile drawer's open/closed state is *not* here: it stays local
`useState` in `GameBoard`, matching the existing `showLog` flag.

### `src/multiplayer/multiplayerClient.ts`

Add `onChatMessage?: (message: ChatMessage) => void` to the handlers and
`sendChat: (text: string) => void` to the returned object
(`socket.emit('chat:send', { text })`).

### `src/components/OnlineLobby.tsx`

Wire `onChatMessage` to the store's `append`, call `reset()` on `onRoomLeft`,
render `<ChatPanel />` beside the player list in the lobby view, and pass
`onSendChat` down to `GameBoard`.

### `src/components/GameBoard.tsx`

New optional prop `onSendChat?: (text: string) => void`. Its presence means
online mode and gates the chat UI plus the `has-chat` class — the same idiom as
the existing optional `onLeave`. Chat messages are read from the store directly,
not drilled through props.

### Components

| File | Responsibility |
| --- | --- |
| `src/components/chat/ChatPanel.tsx` | heading, list, composer; shared by the desktop sidebar and the mobile drawer |
| `src/components/chat/ChatMessageList.tsx` | scroll container, autoscroll to bottom on append |
| `src/components/chat/ChatMessageItem.tsx` | renders one message, switching on `kind` — the trade extension point |
| `src/components/chat/ChatComposer.tsx` | input, Enter to send, length guard |
| `src/components/chat/ChatDrawer.tsx` | mobile wrapper, reusing the `GameLogDrawer` mechanism |

`ChatPanel` is written once and used in both placements. Own messages are styled
distinctly from others'.

## Layout

Adding a third column is not free. Measured against the current tokens
(`--sidebar-w: clamp(13rem, 15vw, 19rem)`, `--controls-space: clamp(8.5rem, 12vw,
13rem)`, `--card-w: clamp(5rem, min(9vw, 12.4vh), 13rem)`) with a seven-card hand
(`HAND_LIMIT` is 6, but a hand holds up to 7 mid-turn before the forced discard):

| Viewport | Space for the hand | Seven cards need | Result |
| --- | --- | --- | --- |
| 1920×1080 | 928 px | 1001 px | overflows by 73 px |
| 1440×900 | 662 px | 835 px | overflows by 173 px |
| 1366×768 | 628 px | 712 px | overflows by 84 px |

The cause: the board would carry four fixed gutters — two `--sidebar-w` at 15vw
and two `--controls-space` at 12vw. That is 54vw of chrome, leaving 46vw for
cards. Today this does not overflow only because there is one sidebar.

Three layers address it together, not as alternatives:

1. **The hand row scrolls on desktop.** Currently only mobile sets
   `overflow-x: auto`. Desktop gets the same treatment (`justify-content: safe
   center`, hidden scrollbar). This is the safety net: overflow degrades into
   scrolling instead of breaking, and cards keep a legible size.
2. **The chat sidebar collapses.** A toggle reclaims 15vw on demand. Default
   expanded; state in `chatStore.isCollapsed`, so it dies on reload.
3. **`--chat-w: var(--sidebar-w)`.** Symmetric with the left sidebar by default,
   and a single knob to break symmetry if measurement says the board is still too
   cramped.

```css
.game-board { grid-template-columns: var(--sidebar-w) minmax(0, 1fr); }
.game-board.has-chat {
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--chat-w);
}
.chat-sidebar { grid-column: 3; grid-row: 1 / -1; border-left: 1px solid var(--card-border); }
```

`border-left` mirrors `.player-sidebar`'s `border-right`, with the same background
and `backdrop-filter`, so the two wings read as a matched pair.

Mobile (`max-width: 800px`): `.chat-sidebar { display: none }`. A 💬 button sits
next to the existing log button and opens `ChatDrawer`, which reuses the
`GameLogDrawer` slide-up mechanism. The button carries an unread-count badge.

## Testing

- `parseChatSendPayload`: rejects a missing field, a non-string, an empty or
  whitespace-only string, and a string over 300 characters; trims valid input.
  Follows `server/tests/socketPayload.test.ts`.
- `rateLimiter`: five in a burst pass, the sixth is refused, capacity returns
  after a second. Deterministic via the injected `now`.
- `chatGateway`: a payload attempting to supply its own `author` or `playerId` is
  ignored and the name comes from the session; the broadcast reaches every room
  member including the sender; a socket with no session is refused.
- `chatStore`: `append` adds, `unreadCount` increments, `markRead` zeroes it,
  `reset` clears everything.
- Layout is verified by measurement, not unit tests: browse at 1920×1080,
  1600×950, 1440×900, 1366×768, 1280×700, and 375×812, asserting board height
  equals viewport height, `document.body.scrollWidth === clientWidth`, and
  checking the hand row's `scrollWidth` against its `clientWidth` with a
  seven-card hand.

## Follow-up work this unblocks

1. **Trade.** Add `ChatTradeOfferMessage` to the union, a `tradeOffer` branch in
   `ChatMessageItem` with accept/decline buttons, a server-validated swap command
   in the game engine, and its own spec.
2. **Voice.** Separate spec, as described in Out of scope.
