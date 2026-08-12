import { t } from '../i18n'
import logo480 from '../assets/logo-480.webp'
import logo900 from '../assets/logo-900.webp'

interface HomeScreenProps {
  onLocal: () => void
  onOnline: () => void
}

export function HomeScreen({ onLocal, onOnline }: HomeScreenProps) {
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
        <div className="divider" />
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
