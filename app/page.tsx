"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const features = [
  {
    number: "01",
    title: "Wszystkie zobowiązania w jednym miejscu",
    text: "VAT, PIT, CIT i ZUS z czytelnym terminem, kwotą oraz statusem. Bez przeszukiwania maili i wiadomości.",
  },
  {
    number: "02",
    title: "Płatność bez przepisywania danych",
    text: "Klient przechodzi od powiadomienia do płatności w kilka sekund. Rachunek, tytuł i kwota są już uzupełnione.",
  },
  {
    number: "03",
    title: "Przypomnienia, które wysyłają się same",
    text: "System pilnuje terminów i automatycznie ponawia przypomnienie, zanim zaległość trafi z powrotem do księgowego.",
  },
  {
    number: "04",
    title: "Dokumenty bez chaosu",
    text: "Klient widzi, co dotarło, czego brakuje i które dokumenty zostały już przetworzone przez biuro.",
  },
];

const faqs = [
  [
    "Czy muszę zmieniać program księgowy?",
    "Nie. Rachuno jest warstwą kontaktu z klientem, a nie zamiennikiem programu księgowego. W pilotażu dane można wgrywać ręcznie, a kolejne integracje dobieramy do używanych systemów.",
  ],
  [
    "Czy płatności w demonstracji są prawdziwe?",
    "Nie. Udostępniony panel jest bezpieczną makietą produktu. Prawdziwe płatności i automatyczne potwierdzenia zostaną uruchomione dopiero po integracji z licencjonowanym operatorem płatności.",
  ],
  [
    "Czy portal może działać pod marką mojego biura?",
    "Tak. W planie Pro przewidujemy logo biura, własne kolory, adres portalu oraz szablony wiadomości dopasowane do komunikacji z klientami.",
  ],
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);

  function submitPilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSent(true);
  }

  return (
    <main className="site-shell">
      <header className="landing-nav">
        <Link className="brand" href="/" aria-label="Rachuno, strona główna">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>
            <strong>RACHUNO</strong>
            <small>portal dla biur</small>
          </span>
        </Link>

        <button
          className="menu-button"
          type="button"
          aria-label="Otwórz menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span />
          <span />
        </button>

        <nav className={menuOpen ? "nav-links nav-links-open" : "nav-links"} aria-label="Główna nawigacja">
          <a href="#jak-dziala" onClick={() => setMenuOpen(false)}>Jak działa</a>
          <a href="#funkcje" onClick={() => setMenuOpen(false)}>Funkcje</a>
          <a href="#cennik" onClick={() => setMenuOpen(false)}>Cennik</a>
          <Link className="button button-small button-dark" href="/panel">Otwórz demo <span>↗</span></Link>
        </nav>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="eyebrow"><span /> Dla nowoczesnych biur rachunkowych</div>
          <h1>Mniej pytań o podatki.<br /><em>Więcej spokoju.</em></h1>
          <p className="hero-lead">
            Rachuno przekazuje klientom kwoty VAT, PIT i ZUS, pilnuje terminów i porządkuje dokumenty, zanim rozdzwonią się telefony.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/panel">Zobacz panel klienta <span>→</span></Link>
            <a className="text-link" href="#pilot">Dołącz do pilotażu <span>↓</span></a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>AM</span><span>KP</span><span>+8</span>
            </div>
            <p><strong>10 miejsc w pilotażu</strong><br />50% zniżki na stałe dla pierwszych biur</p>
          </div>
        </div>

        <div className="hero-visual" aria-label="Podgląd panelu klienta">
          <div className="mint-orbit orbit-one" />
          <div className="mint-orbit orbit-two" />
          <div className="preview-window">
            <div className="preview-topbar">
              <div className="preview-logo"><span>R</span> RACHUNO</div>
              <div className="preview-person"><span>MK</span><div><strong>Marcin Kowalski</strong><small>Kowalski Studio</small></div></div>
            </div>
            <div className="preview-content">
              <div className="preview-greeting"><small>Dzień dobry, Marcin</small><strong>Twoje rozliczenia</strong></div>
              <div className="preview-card preview-card-main">
                <div className="preview-card-head"><span>Najbliższa płatność</span><b>6 dni</b></div>
                <small>VAT za lipiec 2026</small>
                <strong className="preview-amount">7 830,00 zł</strong>
                <div className="preview-meta"><span>Termin: 20 sierpnia</span><button>Zapłać teraz →</button></div>
              </div>
              <div className="preview-grid">
                <div className="preview-stat"><span className="status-dot green" /><small>Dokumenty</small><strong>48</strong><em>Kompletne</em></div>
                <div className="preview-stat"><span className="status-dot yellow" /><small>Do uzupełnienia</small><strong>2</strong><em>Sprawdź braki</em></div>
              </div>
              <div className="preview-row"><span className="preview-row-icon">Z</span><div><strong>ZUS za lipiec</strong><small>Termin 20 sierpnia</small></div><b>1 773,96 zł</b></div>
            </div>
          </div>
          <div className="floating-note note-paid"><span>✓</span><div><strong>Płatność przyjęta</strong><small>VAT, 7 830,00 zł</small></div></div>
          <div className="floating-note note-time"><span>14h</span><div><strong>mniej telefonów</strong><small>miesięcznie</small></div></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="Planowane integracje">
        <span>Przygotowany na integracje z</span>
        <div><b>KSeF</b><b>Comarch</b><b>Insert</b><b>Symfonia</b><b>mBank</b></div>
      </section>

      <section className="problem-section" id="jak-dziala">
        <div className="section-kicker">Problem, który znasz</div>
        <div className="problem-grid">
          <h2>10. i 20. dzień miesiąca nie musi oznaczać <em>lawiny wiadomości.</em></h2>
          <div className="problem-copy">
            <p>Klient nie chce dzwonić. Chce tylko szybko sprawdzić kwotę, termin i status dokumentów.</p>
            <p>Rachuno daje mu odpowiedź od razu, a Twojemu zespołowi oddaje czas na pracę, która naprawdę wymaga wiedzy księgowego.</p>
          </div>
        </div>
        <div className="before-after">
          <div className="before-card">
            <span className="card-label">DZIŚ</span>
            <div className="message-bubble message-left">Dzień dobry, ile mam zapłacić ZUS?</div>
            <div className="message-bubble message-right">Czy moja faktura dotarła?</div>
            <div className="message-bubble message-left">Proszę jeszcze raz wysłać numer konta 🙏</div>
            <div className="chaos-caption"><strong>47 rozproszonych wiadomości</strong><small>WhatsApp, e-mail i SMS</small></div>
          </div>
          <div className="transform-arrow" aria-hidden="true">→</div>
          <div className="after-card">
            <span className="card-label label-mint">Z RACHUNO</span>
            <div className="calm-number">3</div>
            <strong>proste statusy</strong>
            <div className="status-list">
              <span><i className="green" /> Do zapłaty</span>
              <span><i className="yellow" /> Brakuje dokumentu</span>
              <span><i className="blue" /> Rozliczone</span>
            </div>
            <div className="calm-caption">Klient wie, co dalej. Bez telefonu.</div>
          </div>
        </div>
      </section>

      <section className="features-section" id="funkcje">
        <div className="section-heading">
          <div><span className="section-kicker light">Co robi Rachuno</span><h2>Prosty portal.<br />Duża różnica.</h2></div>
          <p>Jedno miejsce dla informacji, o które klienci pytają najczęściej.</p>
        </div>
        <div className="features-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.number}>
              <span className="feature-number">{feature.number}</span>
              <div className="feature-icon" aria-hidden="true">{feature.number === "01" ? "₿" : feature.number === "02" ? "→" : feature.number === "03" ? "◷" : "□"}</div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="steps-section">
        <div className="section-kicker">Jak zacząć</div>
        <h2>Od pliku do spokoju<br />w trzech krokach.</h2>
        <div className="steps-grid">
          <article><span>1</span><div><h3>Dodajesz klientów</h3><p>Importujesz listę firm i wybierasz, które informacje mają zobaczyć w portalu.</p></div></article>
          <article><span>2</span><div><h3>Wgrywasz rozliczenia</h3><p>Na start wystarczy prosty plik. Docelowo dane będą pobierane z programu księgowego.</p></div></article>
          <article><span>3</span><div><h3>Rachuno pilnuje reszty</h3><p>Klient dostaje powiadomienie, płaci i widzi potwierdzenie bez angażowania księgowego.</p></div></article>
        </div>
      </section>

      <section className="pricing-section" id="cennik">
        <div className="pricing-copy">
          <span className="section-kicker light">Program pilotażowy</span>
          <h2>Cena, która zwraca się po kilku telefonach mniej.</h2>
          <p>Wszystkie funkcje portalu, nielimitowane powiadomienia e-mail i bezpośrednie wsparcie przy wdrożeniu.</p>
          <ul>
            <li><span>✓</span> Bez opłaty wdrożeniowej</li>
            <li><span>✓</span> Import klientów i danych startowych</li>
            <li><span>✓</span> Wpływ na rozwój produktu</li>
          </ul>
        </div>
        <div className="pricing-card">
          <div className="pilot-badge">PIERWSZE 10 BIUR</div>
          <div className="price-old">299 zł / mies.</div>
          <div className="price"><strong>149</strong><span>zł<br />/ miesiąc</span></div>
          <p>do 30 obsługiwanych firm</p>
          <a className="button button-primary button-wide" href="#pilot">Rezerwuję miejsce <span>→</span></a>
          <small>50% zniżki zostaje z Tobą na stałe.</small>
        </div>
      </section>

      <section className="faq-section">
        <div><span className="section-kicker">Najczęstsze pytania</span><h2>Bez drobnego druku.</h2></div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => (
            <details key={question} open={index === 0}>
              <summary>{question}<span>+</span></summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="pilot-section" id="pilot">
        <div className="pilot-copy">
          <span className="section-kicker light">Zostań współtwórcą</span>
          <h2>Twoi klienci zasługują na prostszą księgowość.</h2>
          <p>Zostaw kontakt. W 20 minut pokażemy Ci demo i sprawdzimy, czy Rachuno pasuje do pracy Twojego biura.</p>
        </div>
        {sent ? (
          <div className="form-success" role="status"><span>✓</span><div><strong>Dziękujemy!</strong><p>Zgłoszenie demonstracyjne zostało zapisane. W wersji produkcyjnej w tym miejscu trafi do zespołu Rachuno.</p></div></div>
        ) : (
          <form className="pilot-form" onSubmit={submitPilot}>
            <label>Imię i nazwisko<input required name="name" placeholder="Anna Kowalska" autoComplete="name" /></label>
            <label>E-mail służbowy<input required type="email" name="email" placeholder="anna@twojebiuro.pl" autoComplete="email" /></label>
            <label>Liczba obsługiwanych firm<select name="clients" defaultValue="31-100"><option>do 30</option><option>31-100</option><option>powyżej 100</option></select></label>
            <button className="button button-primary button-wide" type="submit">Chcę zobaczyć Rachuno <span>→</span></button>
            <small>Bez zobowiązań. Najpierw krótka rozmowa i dopasowane demo.</small>
          </form>
        )}
      </section>

      <footer className="footer">
        <Link className="brand brand-footer" href="/"><span className="brand-mark" aria-hidden="true">R</span><span><strong>RACHUNO</strong><small>portal dla biur</small></span></Link>
        <p>Spokojniejsza komunikacja między biurem rachunkowym a klientem.</p>
        <div><a href="#funkcje">Funkcje</a><a href="#cennik">Cennik</a><Link href="/panel">Demo panelu</Link></div>
        <small>© 2026 Rachuno. Koncepcja demonstracyjna.</small>
      </footer>
    </main>
  );
}
