# 00 - Tổng quan & Kiến trúc

## 1. Mục tiêu

Side Effects Boardgame là game thẻ bài nhiều người chơi trên web. Người chơi có thể vào phòng với tư cách guest hoặc đăng nhập Supabase để khôi phục phòng khi mất kết nối.

## 2. Luồng hệ thống

1. Client render state nhận từ server.
2. Người chơi gửi ý định qua socket.
3. Server validate và áp luật chơi.
4. Server cập nhật room snapshot rồi broadcast state mới.

## 3. Ranh giới chính

- `src/`: UI, audio, localization, shared game engine, test
- `server/`: room lifecycle, socket handlers, session security, persistence, test
- `supabase/`: migration cho persistence
- `docs/`: tài liệu thực hành
- `designs/`: tài liệu thiết kế

## 4. Quyết định kiến trúc

- Server là nguồn sự thật cho game state.
- Client không tự mutate game state.
- Hidden information chỉ được gửi khi hợp lệ.
- Zustand chỉ giữ UI state.
- Room persistence có thể là in-memory hoặc Supabase tùy môi trường/cấu hình.

## 5. Stack chính

- Client: React, Vite, TypeScript, Zustand, Socket.IO client
- Server: Node.js, TypeScript, Socket.IO, `jose`
- Auth và storage: Supabase
- Test: Vitest

## 6. Tài liệu liên quan

- `01_cards.md`
- `02_game_modes.md`
- `03_game_engine.md`
- `04_session_storage.md`
- `05_database.md`
- `06_client_server.md`
- `07_ui.md`
- `08_infrastructure.md`
- `09_code_style.md`
