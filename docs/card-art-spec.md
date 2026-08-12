# Card art spec — 17 card faces

Generated from `src/game/cards/definitions.ts` + `src/i18n/vi.ts`.
Regenerate: `node gen_cardspec.mjs`. Machine-readable twin: `card-art-spec.json`.

**Output size: 1024×1536 (2:3).** File name must be the `id` column — the code maps by id, not by Vietnamese name.

## Rối loạn — 8 — template `benh.png` — section label `CƠN PHÁT BỆNH`

| id / file | Tên | Cơn phát bệnh |
|---|---|---|
| `depression` | Trầm cảm | Bỏ qua lượt tiếp theo của bạn. |
| `anxiety` | Lo âu | Cho người gây Cơn phát bệnh xem bài trên tay; họ lấy 1 lá. |
| `impotence` | Rối loạn cương dương | Trong lượt tiếp theo, bạn không được chơi lá bài nào. |
| `gambling-addiction` | Nghiện cờ bạc | Người gây Cơn phát bệnh lấy ngẫu nhiên tối đa 3 lá từ tay bạn. |
| `suicidal-thoughts` | Ý nghĩ tự sát | Bỏ toàn bộ bài trên tay. |
| `tremors` | Run rẩy | Trong 3 giây, chọn và bỏ 3 lá trên tay. Nếu không hoàn thành kịp, bỏ toàn bộ bài trên tay. |
| `anorexia` | Chán ăn tâm thần | Trong lượt tiếp theo, bạn không được rút bài. |
| `madness` | Loạn trí | Bỏ tất cả Thuốc đang nằm trong Tâm trí của bạn. |

## Thuốc — 7 — template `medicine_template.png` — labels `ĐIỀU TRỊ` + `TÁC DỤNG PHỤ`

| id / file | Tên | Điều trị | Tác dụng phụ | # |
|---|---|---|---|---|
| `depression-treatment` | Fluoxetine | Trầm cảm | Rối loạn cương dương · Ý nghĩ tự sát · Chán ăn tâm thần | 3 |
| `anxiety-treatment` | Lorazepam | Lo âu | Ý nghĩ tự sát · Trầm cảm · Loạn trí | 3 |
| `impotence-treatment` | Sildenafil | Rối loạn cương dương | Lo âu | 1 |
| `gambling-addiction-treatment` | Lithium | Nghiện cờ bạc | Rối loạn cương dương | 1 |
| `suicidal-thoughts-treatment` | Clozapine | Ý nghĩ tự sát | Loạn trí | 1 |
| `tremors-treatment` | Pramipexole | Run rẩy | Nghiện cờ bạc · Trầm cảm · Loạn trí | 3 |
| `madness-treatment` | Chlorpromazine | Loạn trí | Run rẩy | 1 |

## Còn lại — 2

| id / file | Template | Tên | Mô tả |
|---|---|---|---|
| `episode` | `lencon.png` | Lên cơn! | Chọn một Rối loạn chưa được điều trị của người chơi khác và kích hoạt hiệu ứng Cơn phát bệnh của nó. |
| `therapy` | `cure.png` | Trị liệu | Loại bỏ một Rối loạn chưa được điều trị khỏi Tâm trí của bạn. |

`therapy` has an extra restriction line, currently shown only on the expanded card:
> Không thể dùng lên Run rẩy. Chán ăn tâm thần chỉ có thể được điều trị bằng Trị liệu.

Bake it in or drop it — your call.

## Notes for the generation loop

1. **Side-effect count is not uniform.** 4/7 drugs have 1 side effect, 3/7 have 3. The supplied template has only **2** pill slots. The three-slot drugs are Fluoxetine, Lorazepam, Pramipexole — together **16 of the 36 drug cards** in the deck, so this is not an edge case. The prompt must handle 1, 2 and 3.
2. **Drug names stay in English** (Fluoxetine, Lorazepam, …). The code does not translate them; that is deliberate.
3. **The type name and `MÔ TẢ` are already baked into the four templates.** Do not print them twice.
4. Baking the text fixes the *composited/fake* look and the text-overflow problem. It does **not** make the text readable at board size (cards render 93–135 CSS px wide) — that needs a zoom-on-hover view, which is separate work.
