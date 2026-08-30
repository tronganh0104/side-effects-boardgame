# 06 - Client ↔ Server

## 1. Mục tiêu

Realtime communication đi qua Socket.IO. Server giữ quyền quyết định cuối cùng.

## 2. Luồng

Client gửi event -> server validate -> server cập nhật state -> server broadcast lại.

## 3. Event nhóm chính

- room lifecycle
- gameplay command
- session restore
- chat
- trade

## 4. Validation

Mọi payload từ client đều phải được kiểm tra server-side trước khi xử lý.

## 5. Reconnect

Khi reconnect, server phải restore đúng seat và state theo session/grace period.
