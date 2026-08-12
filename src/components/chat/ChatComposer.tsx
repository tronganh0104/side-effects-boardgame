import { useState } from 'react'
import { CHAT_TEXT_MAX_LENGTH } from '../../../server/chat/types'
import { t } from '../../i18n'

interface ChatComposerProps {
  onSend: (text: string) => void
}

export function ChatComposer({ onSend }: ChatComposerProps) {
  const [text, setText] = useState('')

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSend(trimmed)
    setText('')
  }

  return (
    <form
      className="chat-composer"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        className="chat-composer-input"
        value={text}
        maxLength={CHAT_TEXT_MAX_LENGTH}
        rows={1}
        placeholder={t('chatPlaceholder')}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter falls through to the textarea's default
          // behaviour and inserts a newline instead.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
      />
      <button type="submit" className="chat-composer-send">
        {t('chatSend')}
      </button>
    </form>
  )
}
