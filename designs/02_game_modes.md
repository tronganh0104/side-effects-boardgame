# 02 - Chế độ chơi & Cấu hình

## 1. Mục tiêu

Mode design cần tách rõ luật cốt lõi khỏi các tuỳ chọn phòng.

## 2. Chế độ

- `Standard`: mode mặc định
- `Quick Play`: rút ngắn ván
- `Chaos Mode`: biến động cao hơn, can thiệp nhiều hơn

## 3. Cấu hình host

Host là người chỉnh cấu hình phòng trước khi bắt đầu. Các player khác chỉ xem.

Nhóm cấu hình chính:

- số Disorder ban đầu
- giới hạn bài trên tay
- cho phép xem trước thẻ rút
- bật/tắt reveal khi trị bệnh
- thời gian tối đa mỗi lượt
- bật/tắt chat

## 4. Lobby behavior

- Người chơi vào phòng và đánh dấu sẵn sàng.
- Host chỉ được bắt đầu khi phòng hợp lệ.
- Realtime update phải phản ánh ngay cho mọi người trong room.

## 5. Điều kiện thắng

Người chơi thắng khi trị hết Disorder trong psyche theo luật của mode đang chơi. Kiểm tra nên xảy ra ngay sau hành động hợp lệ.
