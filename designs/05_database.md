# 05 - Database

## 1. Mục tiêu

Database chỉ phục vụ auth và persistence, không là nơi giữ game logic.

## 2. Supabase

Supabase cung cấp:

- email/password auth
- verify token ở server
- room persistence qua adapter riêng

## 3. Env

- `SUPABASE_SECRET_KEY` chỉ ở server
- `VITE_*` chỉ chứa biến public cho client
- Dev ưu tiên in-memory

## 4. Snapshot

Room snapshot phải deserialize an toàn và không làm crash server khi dữ liệu cũ xuất hiện.
