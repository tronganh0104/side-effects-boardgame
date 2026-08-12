import { useState } from 'react'
import { t } from '../i18n'
import logo480 from '../assets/logo-480.webp'
import logo900 from '../assets/logo-900.webp'

interface SetupScreenProps {
  error?: string
  onStart: (names: string[]) => void
}

export function SetupScreen({ error, onStart }: SetupScreenProps) {
  const [names, setNames] = useState([`${t('player')} 1`, `${t('player')} 2`])
  const localError =
    names.length < 2 || names.length > 8 || names.some((name) => !name.trim())

  return (
    <main className="setup-screen">
      <section className="panel panel-surface panel-surface--framed">
        {/* Same reasoning as HomeScreen.tsx: the logo art already spells out
            "SIDE EFFECTS", so it replaces the old teal-gradient text title
            rather than getting its own plain-ink restyle — one title
            treatment for both screens instead of two. The h1 stays for
            accessibility/SEO; the image is decorative. */}
        <h1 className="visually-hidden">{t('title')}</h1>
        <img
          className="logo-mark"
          src={logo900}
          srcSet={`${logo480} 480w, ${logo900} 900w`}
          sizes="168px"
          width={900}
          height={600}
          alt=""
        />
        <p className="setup-subtitle">{t('localGame')}</p>

        {names.map((name, index) => (
          <label className="name-field" key={`player-${index + 1}`}>
            <span className="label">{t('player')} {index + 1}</span>
            <div className="input-row">
              <input
                className="field-input"
                value={name}
                onChange={(event) =>
                  setNames((current) =>
                    current.map((value, currentIndex) =>
                      currentIndex === index ? event.target.value : value,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="icon-btn"
                disabled={names.length <= 2}
                aria-label={`Xóa Người chơi ${index + 1}`}
                onClick={() =>
                  setNames((current) =>
                    current.filter((_, currentIndex) => currentIndex !== index),
                  )
                }
              >
                ✕
              </button>
            </div>
          </label>
        ))}

        <p className="player-count"><strong>{names.length}</strong>/8 người chơi</p>

        <div className="button-row">
          <button
            type="button"
            disabled={names.length >= 8}
            onClick={() =>
              setNames((current) => [
                ...current,
                `${t('player')} ${current.length + 1}`,
              ])
            }
          >
            + {t('addPlayer')}
          </button>
          <button
            type="button"
            className="primary"
            disabled={localError}
            onClick={() => onStart(names.map((name) => name.trim()))}
          >
            {t('startGame')}
          </button>
        </div>

        {localError && names.some((n) => !n.trim()) && (
          <p className="error">Nhập 2–8 tên người chơi hợp lệ.</p>
        )}
        {error && <p className="error">{error}</p>}
      </section>
    </main>
  )
}
