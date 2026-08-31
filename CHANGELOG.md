# Changelog

All notable changes to this project are documented in this file.

The format follows Keep a Changelog and uses calendar dates because this repository does not currently ship semantic releases.

## [0.1.0] - 2026-08-31

### Added

- Room leave and resume support in the online lobby flow.
- Room links in the URL bar so online rooms can be opened directly from `/<ROOMCODE>`.
- A second lobby copy action for sharing the full room link, alongside the raw room code.
- Auto-advance after two actions: the turn ends automatically once a player has played two cards, entering the discard phase if the hand exceeds the limit.
- Players in a 3P+ active game can now leave mid-game; their hand and Psyche cards return to the draw pile, the turn advances to the next player, and the room continues normally. If only one player remains after a leave, the game ends immediately.

### Changed

- The online lobby now pre-fills and auto-joins from a room code in the URL when possible, and clears the URL when leaving or recovery fails.
- Trading no longer has a once-per-turn cap, so players can exchange cards repeatedly within the same turn.
- Trade state was simplified by removing the per-turn trade flag from player views, persistence, and engine state.
- Manual discard ("bỏ bài") no longer counts as one of the two play actions per turn.
- The "Về phòng" surrender button and the duplicate "Xin thua" forfeit button have been removed from the in-game top bar. A single "Rời phòng" button now handles leaving — confirming before acting, with a message appropriate to the player count.
- The `room:leave` socket handler now uses the raw session map instead of the active-socket check, so players can leave even during a brief disconnect or mid-reconnect.

## [Unreleased]

### Added

- A forfeit action that ends the active game and resolves the room state.
- Manual discard support for active turns.
- Compact board controls, centered deck placement, and fixed-size cards.
- Selection toggling so clicking an already selected card clears it.
- Documentation files for architecture, development, deployment, troubleshooting, and contribution workflows.
- Repository metadata files: `AGENTS.md`, `LICENSE`, and GitHub templates.

### Changed

- Updated the game board layout to keep important controls visible without scrolling.
- Updated card attachments so drugs visually replace the previous state and discard effects remove them correctly.
- Reworked the agent guidance file to match the current repository structure.

### Fixed

- Prevented the board from locking up when end-turn and hand-size edge cases occur.
- Ensured validation errors surface as popups instead of silent failures.

## [2026-08-10]

Initial documented release of the current Side Effects Boardgame workspace snapshot.