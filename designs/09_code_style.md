# 09 - Code Style

## 1. Mục tiêu

Quy ước code phải giúp project dễ đọc, dễ test, và dễ chỉnh khi luật thay đổi.

## 2. Quy ước chính

- UI text dùng tiếng Việt
- code identifier dùng tiếng Anh
- comment ngắn, chỉ giải thích chỗ không hiển nhiên
- một hàm nên làm một việc

## 3. TypeScript và module

- Client dùng ES Modules
- Server build ra CommonJS
- Import source viết theo kiểu TypeScript resolve được

## 4. Naming

- `camelCase` cho biến và hàm
- `PascalCase` cho component, class, type
- `UPPER_SNAKE_CASE` cho hằng số

## 5. State

- Zustand chỉ dùng cho UI state
- Không đưa game state vào store

## 6. Socket.IO

- Payload từ client phải validate ở server
- Error phải trả về đúng socket liên quan
- Identity phải lấy từ session server-side
