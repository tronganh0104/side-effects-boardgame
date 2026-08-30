# 04 - Session & Room Storage

## 1. Mục tiêu

Session và room storage phải hỗ trợ guest, người dùng Supabase, và reconnect an toàn.

## 2. Session model

- Server cấp session token khi join phòng.
- Guest cần token để reconnect trong cùng tab/ngữ cảnh.
- User đã đăng nhập có thể được map vào account để khôi phục seat trong grace period.

## 3. Storage model

- Dev mặc định dùng in-memory.
- Production dùng Supabase khi bật persistence.
- Snapshot cũ phải được deserialize an toàn.

## 4. Versioning

Snapshot cần có chiến lược versioning để không làm crash server khi cấu trúc đổi.

## 5. Lobby

Lobby không nên bị coi như một ván đã kết thúc. Grace chủ yếu áp dụng cho phòng đang chơi.
