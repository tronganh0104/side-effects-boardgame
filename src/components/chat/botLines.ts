/**
 * Flavour text for the local hot-seat chat bot (see localChatBot.ts). Kept as
 * a dedicated pool rather than i18n keys: these are not UI strings, they are
 * content, and a `chatBot1..20` key list would just be noise in en.ts/vi.ts.
 *
 * Tone: a scheming player at the table — paranoid table-talk, bad-faith
 * trade offers, ward-bureaucracy complaints, accusations of a rigged deck.
 * Never a caricature of the disorders themselves; the cards already carry
 * the clinical names, the bot's voice does not need to.
 */
export const botLines: { vi: string[]; en: string[] } = {
  vi: [
    'Ai đang giữ Clozapine mà im như thóc vậy?',
    'Đổi Clozapine lấy 2 lá bất kỳ, quyết luôn không?',
    'Bộ bài này chia thiên vị ai đó, tôi cảm nhận được.',
    'Tôi thề lần này không gây Rối loạn cho ai... trừ khi rút được lá đẹp.',
    'Y tá trưởng ơi, ai cho phép tráo bài giữa ván vậy?',
    'Ký giấy cam kết đi rồi tôi mới tin lời hứa của anh.',
    'Đổi 1 Trị liệu lấy lời hứa không đánh tôi lượt sau, được không?',
    'Hồ sơ bệnh án của tôi dày hơn cả phòng cộng lại, tự hào lắm.',
    'Ai vừa giấu bài dưới gầm ghế đấy?',
    'Thoả thuận miệng ở đây không có giá trị pháp lý đâu, nhưng thôi tôi vẫn tin anh.',
    'Nghe nói phòng bên có đợt thuốc mới, sao mình chưa được cấp?',
    'Tôi trao đổi thật lòng, còn phản bội thì để lượt sau tính.',
    'Bốc trúng Rối loạn cũng là một nghệ thuật, thua keo này ta bày keo khác.',
    'Ai ký duyệt cho anh 2 lá Trị liệu một lượt vậy, tôi muốn khiếu nại.',
    'Đổi 1 Rối loạn lấy sự im lặng của tôi, chốt nhé?',
    'Tôi không nói dối, tôi chỉ... quên nói hết sự thật.',
    'Bàn này thiếu minh bạch, tôi yêu cầu công khai lại bộ bài.',
    'Ai đang tích trữ thuốc mà không chịu điều trị cho ai vậy?',
    'Lượt sau tôi sẽ tốt bụng hơn, hứa đấy... có thể.',
    'Rối loạn của tôi là do tâm lý chiến từ anh gây ra, tôi sẽ trả đũa.',
  ],
  en: [
    "Who's hoarding Clozapine and staying suspiciously quiet?",
    "Trade you my Clozapine for two random cards, deal or no deal?",
    "This deck is rigged, I can feel it in my hand.",
    "I swear I won't inflict another Disorder... unless I draw something juicy.",
    "Head Nurse, who authorized reshuffling mid-game?",
    "Sign a waiver before I believe a word of that promise.",
    "I'll trade one Therapy for your solemn oath not to target me next turn.",
    "My chart is thicker than everyone else's combined. Proud of that, honestly.",
    "Who slipped a card under their chair just now?",
    "Verbal deals aren't legally binding here, but sure, I trust you.",
    "Heard the other ward got new meds. Why are we still rationed?",
    "I negotiate in good faith. Betrayal is a next-turn problem.",
    "Drawing a Disorder is basically performance art at this point.",
    "Who cleared you for two Therapies in one turn? I'm filing a complaint.",
    "Trade one Disorder for my silence about what I just saw. Final offer.",
    "I'm not lying, I'm just withholding the full truth.",
    "This table lacks transparency. I demand a public deck audit.",
    "Someone's stockpiling drugs and treating nobody. Curious.",
    "Next turn I'll be nicer. Maybe. No promises.",
    "My Disorder is clearly psychological warfare on your part. Retaliation incoming.",
  ],
}
