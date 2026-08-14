# Active-game lifecycle

This is the canonical product specification for active-game disconnect and
abandonment behavior. Localization files and UI copy are not the source of
these rules.

## Presence states

- **Connected**: the player has an authenticated active socket. The room player
  has `connected: true`, a socket binding, and no grace deadline.
- **Disconnected in grace**: the player has no active socket and has an
  authoritative absolute `graceExpiresAt` deadline. The client may show a
  countdown, but the server decides whether the seat can resume.
- **Abandoned / terminal 2P result**: when a 2-player grace expires, the
  disconnected player forfeits and the other player wins. The game is finished.
- **Future 3+ elimination**: explicitly deferred. This sprint does not remove
  players from 3+ games or mutate their game state when grace expires.

## Grace boundary

Resume is allowed only while:

```text
now < graceExpiresAt
```

At the boundary and afterwards:

```text
now >= graceExpiresAt
```

abandonment takes precedence over resume. Deadlines are absolute server clock
values and survive restart; runtime timer handles are never persisted.

Each genuine disconnect after a successful reconnect receives a fresh 30-second
grace. There is no cumulative cap.

## 2-player abandonment

Grace expiry forfeits the disconnected player regardless of whether that player
was current or off-turn. It reuses the voluntary 2-player forfeit card/result
semantics: the forfeiting hand and Psyche cards return to the shuffled draw
pile, the forfeiting player is cleared, and the opponent wins.

An explicitly confirmed active 2-player leave is immediate abandonment and does
not wait for grace. A 3+ active-game leave remains rejected in this sprint.
`Xin thua` remains the explicit current-turn game action; navigation leave uses
the abandonment warning instead of exposing a second equivalent primary action.

## Pending decisions and trade

Trade sessions close immediately on disconnect and are not restored. Tremors
keeps its independent authoritative three-second deadline; disconnect grace
does not reset it. If active 2P abandonment occurs while Tremors is pending, the
canonical Tremors timeout consequence is resolved first. Anxiety is not given
new 3+ semantics in this sprint; a terminal 2P abandonment clears pending
Anxiety without transferring a hidden card.

## Restart recovery

v4 snapshots persist `graceExpiresAt`. A v3 active room restored by this
release receives a one-time 30-second restart recovery window from restore time,
is persisted immediately as v4, and will not receive another reset on a later
restart. Existing v4 deadlines are preserved exactly. Expired v4 2P deadlines
resolve abandonment during restore; expired 3+ deadlines remain disconnected
and unresolved until the future elimination sprint.

## Lobby

Lobby disconnect behavior remains unchanged. Grace is scoped to active playing
rooms so disconnected lobby seats are not silently forfeited.