# Changelog

All notable changes to this project are documented in this file.

The format follows Keep a Changelog and uses calendar dates because this repository does not currently ship semantic releases.

## [0.1.0] - 2026-08-31

### Added

- Room leave and resume support in the online lobby flow.
- Room links in the URL bar so online rooms can be opened directly from `/<ROOMCODE>`.
- A second lobby copy action for sharing the full room link, alongside the raw room code.

### Changed

- The online lobby now pre-fills and auto-joins from a room code in the URL when possible, and clears the URL when leaving or recovery fails.

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
