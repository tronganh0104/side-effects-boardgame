/**
 * NoticeModal — Đề xuất: Popup thông báo bắt buộc
 *
 * Tái sử dụng visual shell của game-error-modal nhưng là component riêng
 * có tên rõ ràng để phân biệt hai use-case:
 *
 * - NoticeModal: thông báo một chiều (thông tin + "Đã hiểu"). Không có hậu
 *   quả nào từ việc xác nhận — người chơi chỉ cần biết và tiếp tục.
 *   Dùng cho: vượt giới hạn bài, hiệu ứng buộc bỏ bài, v.v.
 *
 * - game-error-modal (inline trong GameBoard): lỗi engine / lỗi mạng —
 *   vẫn giữ nguyên, không thay thế.
 *
 * NoticeModal KHÔNG đóng khi click vào backdrop — người chơi phải ấn "Đã
 * hiểu". Đây là thuộc tính quan trọng nhất của loại popup này theo spec.
 */

interface NoticeModalProps {
  /** Tiêu đề ngắn, không quá 1 dòng. */
  title: string
  /** Nội dung mô tả. Có thể là string hoặc JSX. */
  children: React.ReactNode
  onConfirm: () => void
}

export function NoticeModal({ title, children, onConfirm }: NoticeModalProps) {
  return (
    <div
      className="game-error-modal notice-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="notice-modal-title"
    >
      <div className="game-error-panel notice-modal-panel">
        <h2 id="notice-modal-title">{title}</h2>
        <div className="notice-modal-body">{children}</div>
        <button type="button" className="primary" onClick={onConfirm}>
          Đã hiểu
        </button>
      </div>
    </div>
  )
}
