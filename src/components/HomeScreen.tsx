import { useEffect, useState } from 'react'
import { useAuthStore } from '../auth/authStore'
import { t } from '../i18n'
import { createMultiplayerClient, multiplayerServerUrl, type AccountRecoveryView } from '../multiplayer/multiplayerClient'
import { AuthPanel } from './AuthPanel'
import logo480 from '../assets/logo-480.webp'
import logo900 from '../assets/logo-900.webp'

interface HomeScreenProps {
  onLocal: () => void
  onOnline: () => void
  onRecover: () => void
}

export function HomeScreen({ onLocal, onOnline, onRecover }: HomeScreenProps) {
  const user = useAuthStore((state) => state.user)
  const [recovery, setRecovery] = useState<AccountRecoveryView>({ status: 'none' })

  useEffect(() => {
    if (!user) return
    const client = createMultiplayerClient(multiplayerServerUrl, { onAccountRecovery: setRecovery }, { autoResume: false })
    client.connect()
    return () => { client.disconnect() }
  }, [user?.id])

  return (
    <main className="setup-screen">
      <section className="panel home-screen panel-surface panel-surface--framed">
        {/* The logo art already spells out "SIDE EFFECTS", so it stands in
            for the visible title. The h1 stays in the DOM — hidden from
            sighted users, exposed to screen readers and search engines —
            as the page's single accessible name; the image itself is
            decorative (alt="") to avoid announcing the name twice. */}
        <h1 className="visually-hidden">{t('title')}</h1>
        <img
          className="logo-mark"
          src={logo900}
          srcSet={`${logo480} 480w, ${logo900} 900w`}
          sizes="(max-width: 480px) 240px, 300px"
          width={900}
          height={600}
          alt=""
        />
        <p className="tagline">"Trị lành hay điên thêm?"</p>
        <AuthPanel />
        {recovery.status !== 'none' && (
          <section className="account-recovery-card" aria-label={t('accountRecoveryTitle')}>
            <h2>{t('accountRecoveryTitle')}</h2>
            <p>{recovery.status === 'already-connected' ? t('accountRecoveryElsewhere') : t('accountRecoveryBody')}</p>
            <button type="button" className="primary" onClick={onRecover}>
              {recovery.status === 'already-connected' ? t('accountTakeover') : t('accountReturnToGame')}
            </button>
          </section>
        )}
        <div className="divider" aria-hidden="true">
          <span className="divider-ornament">♦</span>
        </div>
        <div className="button-row">
          <button type="button" className="primary" onClick={onLocal}>
            {t('localGame')}
            <span className="btn-sub">Tạo ván local 2–8 người</span>
          </button>
          <button type="button" onClick={onOnline}>
            {t('onlineGame')}
            <span className="btn-sub">Tạo phòng &amp; rủ bạn bè</span>
          </button>
        </div>
      </section>
    </main>
  )
}
