<!-- Improved compatibility of back to top link -->

<a id="readme-top"></a>

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![project_license][license-shield]][license-url]

<br />
<div align="center">
  <a href="https://github.com/tronganh0104/side-effects-boardgame">
    <img src="images/logo.svg" alt="Logo" width="80" height="80">
  </a>

<h3 align="center">Side Effects Boardgame</h3>

  <p align="center">
    A real-time multiplayer card game built with React, Vite, TypeScript, and Socket.IO
    <br />
    <a href="designs/00_overview_and_architecture.md"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/tronganh0104/side-effects-boardgame">View Repository</a>
    ·
    <a href="https://github.com/tronganh0104/side-effects-boardgame/issues/new?labels=bug&template=bug_report.md">Report Bug</a>
    ·
    <a href="https://github.com/tronganh0104/side-effects-boardgame/issues/new?labels=enhancement&template=feature_request.md">Request Feature</a>
  </p>
</div>

---

## About The Project

**Side Effects Boardgame** is a browser-based multiplayer card game where players join a room, manage their hand, and play cards against disorders, therapies, and episodes in real time.

The project is split into a small full-stack TypeScript architecture:

1. **React Web Client (`src/`)**: Vite + React UI, local game screen, online lobby, board rendering, audio, and shared game state handling.
2. **Socket.IO Server (`server/`)**: Room lifecycle, session handling, command validation, and optional persistence.
3. **Game Engine (`src/game/`)**: Shared rule logic, card definitions, and deterministic gameplay functions.
4. **Database Layer (`supabase/`)**: Optional Supabase-backed room snapshot persistence.
5. **Design Documents (`designs/`)**: Architecture, game rules, UI, and code-style notes.

### Core Features

* **Real-time Multiplayer**: Rooms sync over Socket.IO.
* **Room Sessions**: Players can resume an existing room session after reconnecting.
* **Shared Game Rules**: Client and server use the same game engine logic.
* **Card-driven Gameplay**: Drug, disorder, therapy, and episode card interactions.
* **Test Coverage**: Client, engine, and server behavior are covered by automated tests.

<p align="center">
  <img src="images/screenshot.png" alt="Side Effects Boardgame screenshot" />
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Documentation

Explore the current documentation set:

* [Overview & Architecture](designs/00_overview_and_architecture.md)
* [Cards](designs/01_cards.md)
* [Game Modes](designs/02_game_modes.md)
* [Game Engine](designs/03_game_engine.md)
* [Session Storage](designs/04_session_storage.md)
* [Database Schema](designs/05_database.md)
* [WebSocket Protocol](designs/06_websocket.md)
* [Client / Server](designs/06_client_server.md)
* [UI](designs/07_ui.md)
* [Infrastructure](designs/08_infrastructure.md)
* [Code Style](designs/09_code_style.md)
* [Changelog](CHANGELOG.md)
* [Developer Guide](docs/README.md)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Built With

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.x-blue?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18%2B-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-Frontend-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Socket.IO-Realtime-black?style=for-the-badge&logo=socketdotio&logoColor=white" />
  <img src="https://img.shields.io/badge/Zustand-State%20Management-44337A?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Supabase-Optional%20Persistence-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" />
</p>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Getting Started & Installation

### Prerequisites

* Node.js 18+
* npm

### Clone the Repository

```sh
git clone https://github.com/tronganh0104/side-effects-boardgame.git
cd side-effects-boardgame
```

### Install Dependencies

```sh
npm install
```

### Run the Development Client

```sh
npm run dev
```

### Run the Development Server

In a separate terminal:

```sh
npm run dev:server
```

### Build for Production

To create a production build:

```sh
npm run build
```

### Run the Production Server

After building the project:

```sh
npm run server:start
```

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Usage

### Game Flow

1. **Home Screen** — Choose local play or online play.
2. **Room Setup** — Create or join a room, then wait in the lobby.
3. **Gameplay** — Draw cards, play disorders, apply therapy, use episodes, and manage discard actions.
4. **Turn Control** — End turns, forfeit, or leave the room when appropriate.
5. **Victory Condition** — The game ends when the active win condition is met.

### Development Flow

1. Update the client or server logic.
2. Update the shared game engine if the rule changes.
3. Run the test suite.
4. Build the project.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Roadmap

* [x] Shared TypeScript game engine
* [x] React + Vite client
* [x] Socket.IO multiplayer server
* [x] Room sessions and reconnect support
* [x] Optional Supabase persistence
* [x] Automated tests for engine, client, and server
* [ ] Production deployment guide refinement
* [ ] More visual polish and accessibility improvements

See the [open issues](https://github.com/tronganh0104/side-effects-boardgame/issues) for a full list of proposed improvements and known issues.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contributing

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Contact

Project Link: [https://github.com/tronganh0104/side-effects-boardgame](https://github.com/tronganh0104/side-effects-boardgame)

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

## Acknowledgments

* Side Effects / boardgame-inspired card game design
* React, Vite, Socket.IO, and Supabase communities
* Contributors who tested gameplay edge cases and UI flows

<p align="right">(<a href="#readme-top">back to top</a>)</p>

---

[contributors-shield]: https://img.shields.io/github/contributors/tronganh0104/side-effects-boardgame.svg?style=for-the-badge
[contributors-url]: https://github.com/tronganh0104/side-effects-boardgame/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/tronganh0104/side-effects-boardgame.svg?style=for-the-badge
[forks-url]: https://github.com/tronganh0104/side-effects-boardgame/network/members
[stars-shield]: https://img.shields.io/github/stars/tronganh0104/side-effects-boardgame.svg?style=for-the-badge
[stars-url]: https://github.com/tronganh0104/side-effects-boardgame/stargazers
[issues-shield]: https://img.shields.io/github/issues/tronganh0104/side-effects-boardgame.svg?style=for-the-badge
[issues-url]: https://github.com/tronganh0104/side-effects-boardgame/issues
[license-shield]: https://img.shields.io/github/license/tronganh0104/side-effects-boardgame.svg?style=for-the-badge
[license-url]: https://github.com/tronganh0104/side-effects-boardgame/blob/remaster/LICENSE
