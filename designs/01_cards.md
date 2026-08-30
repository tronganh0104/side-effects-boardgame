# 01 - Thẻ bài

## 1. Mục tiêu

Card design phải nhất quán giữa code, UI và test. Toàn bộ dữ liệu card nằm trong `src/game/cards/`.

## 2. Phân nhóm

- `disorder`: bệnh nằm trong psyche
- `drug`: trị bệnh nhưng sinh side effect window
- `therapy`: hiệu ứng đặc biệt
- `episode`: kích hoạt hình phạt của disorder

## 3. Nguyên tắc thiết kế

- Tên code dùng tiếng Anh, tên hiển thị dùng tiếng Việt.
- UI không hardcode card data.
- Artwork placeholder có thể thay bằng file ảnh theo slug.
- Metadata card phải đủ để client và server dùng chung.

## 4. Metadata tối thiểu

Mỗi card nên có:

- `slug`
- `displayNameVi`
- `cardType`
- `descriptionVi`
- `artFile`

Tuỳ loại card có thể thêm:

- `drugType`
- `potency`
- `sideEffects`
- `punishmentVi`
- `cureDrugType`
- `bonusEffectVi`

## 5. Deck

Deck cần được sinh từ cùng một nguồn định nghĩa để tránh lệch giữa client và server. Khi đổi card hoặc luật, phải cập nhật test cùng lúc.

## 6. Tài liệu liên quan

- `docs/card-art-spec.md`
- `03_game_engine.md`
