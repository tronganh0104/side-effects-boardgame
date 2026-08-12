# Trao đổi bài (Trading) — Thiết kế

Ngày: 2026-08-11
Trạng thái: chờ duyệt

## 1. Bối cảnh

Luật giấy đã có trao đổi bài (`side-effects-luat-choi.html`, mục "Đàm phán & trao
đổi") nhưng engine chưa hỗ trợ: `GameCommand` hiện có 8 lệnh, không lệnh nào
chuyển bài giữa hai người chơi.

Trên bàn giấy, trao đổi là hành vi vật lý — chìa lá bài qua bàn. Bản digital
không làm được vậy: tay bài là thông tin ẩn do server giữ, và client không được
tự sửa game state. Nên phần chuyển bài **bắt buộc** phải là lệnh engine.

Phần thoả thuận ("tao trị mày lượt sau nếu mày đưa Xanax") thì ngược lại: luật
ghi rõ là **không ràng buộc**, xù được. Engine không được ép. Phần đó thuộc về
chat/voice, ngoài phạm vi tài liệu này.

### Phụ thuộc

Không có. Trade chạy độc lập, kể cả khi chat tắt. `server/trade/` mô phỏng cấu
trúc `server/chat/` (gateway attach vào socket, rate limiter, parse payload tách
file) nhưng **không import** gì từ đó.

## 2. Luật

| Điều | Giá trị | Nguồn |
|---|---|---|
| Phạm vi | 1 lá đổi 1 lá, chỉ bài **trên tay** | Quyết định thiết kế (luật giấy không nói rõ) |
| Số lần | **1 lần mỗi lượt**, đếm theo từng người chơi | Quyết định thiết kế |
| Reset quota | Đầu lượt của chính người đó | Quyết định thiết kế |
| Thời điểm | Bất cứ lúc nào, kể cả ngoài lượt | Luật giấy `:390` |
| Điều kiện | Lượt đang chạy đã qua phase rút (`turn.phase !== 'draw'`) | Quyết định thiết kế |
| Tốn action | Không. Giới hạn 2 lá chơi/lượt không đổi | Luật giấy `:395`, FAQ `:419` |
| Lộ bài | **Úp**. Chỉ thấy "đối phương đã đặt 1 lá" | Quyết định thiết kế |
| Giới hạn 6 lá | Không chặn — chỉ kiểm ở cuối lượt của chính mình | Luật giấy `:325`, `:379` |
| Chốt | **Cả hai** phải bấm Trao đổi | Quyết định thiết kế |
| Huỷ | Đóng phiên. Lần sau chọn lại từ đầu, không nhớ gì | Quyết định thiết kế |

### Luật đi kèm bước mời

1. Lời mời bị **từ chối không trừ quota**. Chỉ giao dịch chốt thành công mới trừ.
2. **Mỗi người 1 phiên tại một thời điểm.** Mời người đang bận → lỗi "đang bận".
3. **Lời mời hết hạn sau 45 giây.** Tránh treo vô hạn vì đối phương AFK.

### Giả định chưa được xác nhận

Hai điểm dưới đây lấy mặc định theo đề xuất, chưa có xác nhận rõ ràng từ chủ dự
án. Lật lại thì chỉ sửa cục bộ.

- **G1 — Quota chỉ trừ người mở lời mời.** Người nhận đổi bao nhiêu lần cũng
  được. Lý do: giao dịch cần cả hai đồng ý nên không ai ép được ai; nếu trừ cả
  hai thì mở giao dịch rác với đối thủ sẽ đốt lượt đổi của họ.
- **G2 — Ẩn nút Trao đổi ở chế độ "Chơi cùng máy" (local hot-seat).** Một người
  cầm cả hai tay bài thì úp bài vô nghĩa.

### Điểm biên đã cân nhắc

Người chơi bị bỏ lượt (`skipTurns`) không được reset quota, vì lượt của họ không
bắt đầu. Chấp nhận — nhất quán với việc họ cũng không rút và không chơi bài.

## 3. Luồng UX

```
[Trao đổi] ─→ danh sách người chơi          (chỉ hiện ở máy người mở)
                    │  bấm 1 người = gửi lời mời ngay
                    ▼
             "Đang chờ B…"            B: badge ở sidebar + toast
                                      "A muốn trao đổi"  [Đồng ý] [Từ chối]
                    │
              B Đồng ý ─────────────→ bảng trao đổi mở ở CẢ HAI
              B Từ chối / hết 45s ──→ đóng, A nhận báo
                    │
    ┌─ TRAO ĐỔI VỚI NGƯỜI CHƠI 2 ─┐
    │   ┌──────┐   ⇄   ┌──────┐   │      ▨ = đối phương đã đặt, úp
    │   │ Bạn  │       │  ▨   │   │
    │   └──────┘       └──────┘   │
    │   [ Trao đổi ]   [ Huỷ ]    │
    └─────────────────────────────┘
                    │
         cả hai bấm Trao đổi ──→ lật bài, đổi, đóng phiên
```

Bảng trao đổi **không có ô chọn người** — chọn người là bước riêng trước đó.

Người nhận lời mời **không bị mở modal**. Chỉ badge ở sidebar trái và toast nhẹ,
không chặn thao tác đang làm dở.

Danh sách người chơi làm mờ kèm lý do với ai không mời được: "đang bận", "đã đổi
lượt này", "mất kết nối".

## 4. Kiến trúc

Hai tầng, ranh giới rõ. Phụ thuộc một chiều: phiên đàm phán biết engine, engine
không biết gì về phiên đàm phán.

### Tầng engine — thuần, deterministic

`src/game/engine/trading.ts`. Chỉ lo: đổi 2 lá giữa 2 tay bài, validate, trừ
quota. Không biết socket, không biết đàm phán, không biết ai đã bấm nút.

```ts
// server/game/commands.ts — thêm 1 variant
| {
    type: 'tradeCards'
    initiatorPlayerId: string
    initiatorCardId: string
    partnerPlayerId: string
    partnerCardId: string
  }
```

Validate lúc commit (ném lỗi nếu sai):

- Hai người chơi khác nhau, cùng tồn tại, game đang `playing`
- Mỗi lá còn nằm đúng trong tay chủ của nó
- `turn.phase !== 'draw'`
- `initiator.tradeUsedThisTurn === false`

Thay đổi state:

- Hoán đổi 2 `CardInstance` giữa 2 mảng `hand`
- `initiator.tradeUsedThisTurn = true`
- Không đụng `turn.cardsPlayedThisTurn`, không đụng `discardPile`

### Thay đổi kiểu dữ liệu

`PlayerState` (`src/game/engine/types.ts`) thêm:

```ts
tradeUsedThisTurn: boolean
```

Reset về `false` trong `beginTurn` (`src/game/engine/turns.ts`) cho đúng người
chơi vừa vào lượt. `setup.ts` khởi tạo `false`.

`PlayerView` (`server/game/playerView.ts`) thêm `tradeUsedThisTurn` — công khai,
không phải thông tin ẩn, cả bàn được biết ai đã dùng lượt đổi.

Serializer persistence (`server/persistence/serializer.ts`) cần đọc/ghi trường
mới, mặc định `false` cho bản ghi cũ.

### Tầng phiên đàm phán — ephemeral, chỉ ở server

`server/trade/`. Bàn thương lượng **không phải game state**: không persist,
không nằm trong `GameState`, mất khi hết lượt hoặc rớt mạng. Chỉ khi cả hai bấm
chốt mới sinh ra một lệnh `tradeCards` bắn vào engine.

```ts
interface TradeSession {
  id: string
  roomId: string
  initiatorPlayerId: string
  partnerPlayerId: string
  phase: 'pending' | 'open'
  initiatorCardId?: string
  partnerCardId?: string
  initiatorReady: boolean
  partnerReady: boolean
  invitedAt: number
}
```

Bất biến: mỗi `playerId` xuất hiện trong tối đa 1 phiên tại một thời điểm.

## 5. Giao thức socket

```
trade:invite   {targetPlayerId}     → tạo phiên pending
trade:accept                        → phiên sang open
trade:decline                       → đóng phiên
trade:place    {cardInstanceId}     → đặt lá vào ô của mình
trade:clear                         → rút lá của mình ra
trade:confirm                       → bấm Trao đổi; đủ 2 cờ → commit
trade:cancel                        → đóng phiên (cả hai bên đều gọi được)

trade:state    (server → 2 bên)     → toàn bộ trạng thái phiên, đã lọc
trade:closed   (server → 2 bên)     {reason: 'committed' | 'declined'
                                     | 'cancelled' | 'expired' | 'disconnected'}
```

Payload `trade:state` gửi cho mỗi bên:

```ts
{
  sessionId: string
  withPlayerId: string
  phase: 'pending' | 'open'
  yourRole: 'initiator' | 'partner'
  yourCardId: string | null
  theyPlaced: boolean        // BOOLEAN, không phải id
  yourReady: boolean
  theyReady: boolean
  expiresAt?: number         // chỉ khi phase === 'pending'
}
```

`theyPlaced` là boolean chứ không phải card id — **úp bài được ép bằng hình dạng
payload, không phải bằng một bước xoá**. Cùng nguyên tắc đang dùng ở
`server/chat/chatGateway.ts:33-35`: cái gì không đọc ra khỏi payload thì không
tồn tại, thay vì tin vào một bước lọc có thể quên.

## 6. Ba chỗ dễ vỡ

### 6.1 Khoá lá đã đặt

Đặt lá vào ô rồi vẫn đánh nó ra được thì đối phương chốt vào một lá không còn
tồn tại. Gateway giữ `lockedCardIds: Map<playerId, cardId>`, và handler
`game:command` hỏi gateway trước khi áp lệnh — từ chối `playDrug` / `playDisorder`
/ `playEpisode` / `playTherapy` / `discard` / `discardManual` trên lá đang khoá.

Engine **vẫn validate lại** lúc commit. Khoá là lớp UX, không phải lớp đúng đắn.

### 6.2 Confirm phải reset khi bên kia đổi lá

Tôi bấm đồng ý, bạn tráo lá khác, tôi thành đồng ý một giao dịch khác. Bất kỳ
`trade:place` hay `trade:clear` nào cũng **xoá cả hai cờ ready**.

### 6.3 Tự huỷ phiên

Đóng phiên và nhả khoá khi: lượt hiện tại kết thúc, một bên rớt mạng, một bên rời
phòng, game kết thúc, hoặc lời mời `pending` quá 45 giây.

## 7. Client

| File | Trách nhiệm |
|---|---|
| `src/store/tradeStore.ts` | Zustand, mirror `trade:state`, phát các event trade |
| `src/components/trade/TradeButton.tsx` | Nút ở controls bar, ẩn ở local mode |
| `src/components/trade/TradePartnerPicker.tsx` | Danh sách người chơi + lý do không mời được |
| `src/components/trade/TradeInviteBadge.tsx` | Badge ở sidebar, Đồng ý / Từ chối, đếm ngược |
| `src/components/trade/TradePanel.tsx` | Bảng 2 ô, Trao đổi / Huỷ |
| `src/components/trade/TradeSlot.tsx` | Một ô — lá ngửa của mình, lưng bài của họ |
| `src/styles/board/trade.css` | Style, dùng token `--card-w` sẵn có |

Animation lúc commit tái dùng `GhostLayer` (transform + opacity, không layout).

## 8. Log và thông tin ẩn

Bài trao đổi **không lộ tên** — khác bài chơi ra. Log công khai chỉ ghi:

```
logTrade: '{player} đã trao đổi 1 lá bài với {target}.'
```

Không tên lá, kể cả sau khi giao dịch xong. AGENTS.md: log công khai không được
rò thông tin ẩn. Chỉ hai bên nhìn thấy lá thật, qua `game:state` riêng của mình.

`describeCommand` (`src/game/log/describeCommand.ts`) xử lý `tradeCards`: in đậm
tên **cả hai người chơi**, không có tên lá để in đậm.

## 9. Chống lạm dụng

- Quota 1 lần/lượt đã chặn phần lớn
- Rate limit `trade:invite` bằng token bucket (khuôn `server/chat/rateLimiter.ts`)
- Chặn khi đang có `pendingDecision` chờ xử lý
- Chặn khi `game.status !== 'playing'`
- Chỉ 1 phiên mỗi người tại một thời điểm

## 10. Kiểm thử

**Engine** (`src/game/tests/trading.test.ts`) — thuần, không cần socket:

- Đổi thành công: 2 tay bài hoán đúng lá, kích thước tay không đổi
- Trừ quota người mở; **không** trừ người nhận (G1)
- Từ chối khi `phase === 'draw'`
- Từ chối khi quota đã dùng
- Từ chối khi lá không nằm trong tay chủ
- Từ chối tự đổi với chính mình
- Không đụng `cardsPlayedThisTurn`
- `beginTurn` reset quota đúng người, không reset người khác
- Nhận bài vượt 6 lá vẫn hợp lệ

**Gateway** (`server/tests/tradeSession.test.ts`, `tradeGateway.test.ts`):

- Máy trạng thái pending → open → committed
- `trade:place` xoá cả hai cờ ready
- `theyPlaced` không bao giờ mang card id (test chống rò)
- Mời người đang bận → lỗi
- Lời mời hết hạn sau 45s
- Rớt mạng đóng phiên và nhả khoá
- Lá đang khoá không đánh/bỏ được

**Payload** (`server/tests/tradePayload.test.ts`): payload rác, thiếu trường,
sai kiểu, id không thuộc phòng.

## 11. Phân rã công việc

Mỗi khối một subagent, chạy tuần tự theo phụ thuộc.

| # | Khối | File | Phụ thuộc |
|---|---|---|---|
| 1 | Engine + kiểu dữ liệu | `engine/trading.ts`, `engine/types.ts`, `turns.ts`, `setup.ts`, `commands.ts`, `playerView.ts`, `serializer.ts`, test | — |
| 2 | Log | `log/describeCommand.ts`, `i18n/{vi,en}.ts`, test | 1 |
| 3 | Phiên + gateway | `server/trade/*`, test | 1 |
| 4 | Khoá lá ở `game:command` | `server/socket/registerSocketHandlers.ts` | 3 |
| 5 | Store client | `src/store/tradeStore.ts` | 3 |
| 6 | UI | `src/components/trade/*`, `styles/board/trade.css` | 5 |
| 7 | Đo bằng Playwright | script kiểm 2 client thật | 6 |

Khối 1 và 3 là phần dễ sai nhất — làm xong phải xanh test trước khi mở khối sau.
