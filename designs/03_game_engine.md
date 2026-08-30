# 03 - Game Engine

## 1. Mục tiêu

Engine là nơi giữ luật chơi và phải deterministic để client, server, test đều đi chung một logic.

## 2. Trách nhiệm

- xử lý card effect
- validate command
- xử lý turn flow
- kiểm tra thắng thua
- hỗ trợ reconnect và snapshot

## 3. Nguyên tắc

- Server là lớp quyết định cuối.
- Client chỉ gửi intent.
- Hidden state không được lộ qua log công khai.
- Mọi thay đổi luật phải đi cùng test.

## 4. Command model

Command được định nghĩa trong shared game code rồi server áp vào state. Không dùng framework game ngoài.

## 5. Validation

Server kiểm tra:

- đúng lượt
- card có trong tay
- target hợp lệ
- action chỉ xảy ra trong đúng window

## 6. Turn flow

Thiết kế hiện tại đi theo chu trình:

1. Rút bài
2. Thực hiện hành động hợp lệ
3. Nếu có side effect window thì mở phản ứng
4. Kết thúc lượt và chuyển lượt

## 7. Abandonment

Grace period và abandonment 2P là spec riêng. Tham chiếu chuẩn nằm ở `docs/active_game_lifecycle.md`.
