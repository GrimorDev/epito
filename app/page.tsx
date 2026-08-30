"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, BellRing, Check, FileCheck2, FolderCheck, WalletCards } from "lucide-react";

const features = [
  {
    number: "01",
    icon: WalletCards,
    title: "Wszystkie zobowiązania w jednym miejscu",
    text: "VAT, PIT, CIT i ZUS z czytelnym terminem, kwotą oraz statusem. Bez przeszukiwania maili i wiadomości.",
  },
  {
    number: "02",
    icon: FileCheck2,
    title: "Płatność bez przepisywania danych",
    text: "Klient przechodzi od powiadomienia do płatności w kilka sekund. Rachunek, tytuł i kwota są już uzupełnione.",
  },
  {
    number: "03",
    icon: BellRing,
    title: "Przypomnienia wysyłają się same",
    text: "Epito pilnuje terminów i ponawia przypomnienie, zanim zaległość trafi z powrotem do księgowego.",
  },
  {
    number: "04",
    icon: FolderCheck,
    title: "Dokumenty bez chaosu",
    text: "Klient widzi, co dotarło, czego brakuje i które dokumenty zostały już przetworzone przez biuro.",
  },
];

const faqs = [
  [
    "Czy muszę zmieniać program księgowy?",
    "Nie. Epito jest warstwą kontaktu z klientem, a nie zamiennikiem programu księgowego. W pilotażu dane można wgrywać ręcznie, a kolejne integracje dobieramy do używanych systemów.",
  ],
  [
    "Czy płatności w demonstracji są prawdziwe?",
    "Nie. Demo nie obciąża rachunku. W panelu produkcyjnym Epito może przygotować dane do zwykłego przelewu, a płatności BLIK i automatyczne potwierdzenia uruchomimy dopiero przez licencjonowanego operatora.",
  ],
  [
    "Czy portal może działać pod marką mojego biura?",
    "Tak. W planie Pro przewidujemy logo biura, własne kolory, adres portalu oraz szablony wiadomości dopasowane do komunikacji z klientami.",
  ],
];

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(([question, answer]) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [pilotPending, setPilotPending] = useState(false);
  const [pilotError, setPilotError] = useState("");
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const heroParallax = useTransform(scrollYProgress, [0, 0.24], [0, 72]);

  async function submitPilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPilotError("");
    const form = new FormData(event.currentTarget);
    setPilotPending(true);
    try {
      const response = await fetch("/api/marketing/pilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          clients: form.get("clients"),
          website: form.get("website"),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się wysłać zgłoszenia.");
      setSent(true);
    } catch (reason) {
      setPilotError(reason instanceof Error ? reason.message : "Nie udało się wysłać zgłoszenia.");
    } finally {
      setPilotPending(false);
    }
  }

  const reveal = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 34 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.18 },
    transition: { duration: reduceMotion ? 0 : 0.62, ease: "easeOut" as const },
  };

  return (
    <main className="site-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <motion.div className="scroll-progress" style={{ scaleX: reduceMotion ? 1 : scrollYProgress }} />

      <header className="landing-nav">
        <Link className="brand" href="/" aria-label="Epito, strona główna">
          <span className="brand-mark" aria-hidden="true">E</span>
          <span>
            <strong>EPITO</strong>
            <small>portal dla biur</small>
          </span>
        </Link>

        <button
          className="menu-button"
          type="button"
          aria-label={menuOpen ? "Zamknij menu" : "Otwórz menu"}
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
          <Link href="/logowanie" onClick={() => setMenuOpen(false)}>Logowanie</Link>
          <Link className="button button-small button-dark" href="/panel">Otwórz demo <ArrowRight size={18} /></Link>
        </nav>
      </header>

      <section className="hero-section">
        <motion.div
          className="hero-copy"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.7, ease: "easeOut" }}
        >
          <h1>Mniej pytań o podatki.<br /><em>Więcej spokoju.</em></h1>
          <p className="hero-lead">
            Epito przekazuje klientom kwoty VAT, PIT i ZUS, pilnuje terminów i porządkuje dokumenty, zanim rozdzwonią się telefony.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/panel">Zobacz panel klienta <ArrowRight size={19} /></Link>
            <a className="text-link" href="#pilot">Dołącz do pilotażu <ArrowRight size={17} /></a>
          </div>
          <div className="hero-proof">
            <div className="avatar-stack" aria-hidden="true">
              <span>AM</span><span>KP</span><span>+8</span>
            </div>
            <p><strong>10 miejsc w pilotażu</strong><br />50% zniżki na stałe dla pierwszych biur</p>
          </div>
        </motion.div>

        <motion.div
          className="hero-visual"
          aria-label="Podgląd panelu klienta Epito"
          initial={{ opacity: 0, x: reduceMotion ? 0 : 45, rotate: reduceMotion ? 0 : 1.5 }}
          animate={{ opacity: 1, x: 0, rotate: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.85, delay: 0.12, ease: "easeOut" }}
          style={{ y: reduceMotion ? 0 : heroParallax }}
        >
          <div className="mint-orbit orbit-one" />
          <div className="mint-orbit orbit-two" />
          <motion.div className="preview-window" whileHover={reduceMotion ? undefined : { rotate: 0, y: -6 }} transition={{ type: "spring", stiffness: 220, damping: 22 }}>
            <div className="preview-topbar">
              <div className="preview-logo"><span>E</span> EPITO</div>
              <div className="preview-person"><span>MK</span><div><strong>Marcin Kowalski</strong><small>Kowalski Studio</small></div></div>
            </div>
            <div className="preview-content">
              <div className="preview-greeting"><small>Dzień dobry, Marcin</small><strong>Twoje rozliczenia</strong></div>
              <div className="preview-card preview-card-main">
                <div className="preview-card-head"><span>Najbliższa płatność</span><b>6 dni</b></div>
                <small>VAT za lipiec 2026</small>
                <strong className="preview-amount">7 830,00 zł</strong>
                <div className="preview-meta"><span>Termin: 20 sierpnia</span><span className="preview-pay">Zapłać teraz <ArrowRight size={13} /></span></div>
              </div>
              <div className="preview-grid">
                <div className="preview-stat"><span className="status-dot green" /><small>Dokumenty</small><strong>48</strong><em>Kompletne</em></div>
                <div className="preview-stat"><span className="status-dot yellow" /><small>Do uzupełnienia</small><strong>2</strong><em>Sprawdź braki</em></div>
              </div>
              <div className="preview-row"><span className="preview-row-icon">Z</span><div><strong>ZUS za lipiec</strong><small>Termin 20 sierpnia</small></div><b>1 773,96 zł</b></div>
            </div>
          </motion.div>
          <motion.div className="floating-note note-paid" animate={reduceMotion ? undefined : { y: [0, -8, 0] }} transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}><span><Check size={16} /></span><div><strong>Płatność przyjęta</strong><small>VAT, 7 830,00 zł</small></div></motion.div>
          <motion.div className="floating-note note-time" animate={reduceMotion ? undefined : { y: [0, 7, 0] }} transition={{ duration: 5.6, repeat: Infinity, ease: "easeInOut" }}><span>14h</span><div><strong>mniej telefonów</strong><small>miesięcznie</small></div></motion.div>
        </motion.div>
      </section>

      <motion.section className="trust-strip" aria-label="Planowane integracje" {...reveal}>
        <span>Przygotowany na integracje z</span>
        <div><b>KSeF</b><b>Comarch</b><b>Insert</b><b>Symfonia</b><b>MT940 / CAMT.053</b></div>
      </motion.section>

      <section className="problem-section" id="jak-dziala">
        <motion.div {...reveal}>
          <div className="section-kicker">Problem, który znasz</div>
          <div className="problem-grid">
            <h2>10. i 20. dzień miesiąca nie musi oznaczać <em>lawiny wiadomości.</em></h2>
            <div className="problem-copy">
              <p>Klient nie chce dzwonić. Chce tylko szybko sprawdzić kwotę, termin i status dokumentów.</p>
              <p>Epito daje mu odpowiedź od razu, a Twojemu zespołowi oddaje czas na pracę, która naprawdę wymaga wiedzy księgowego.</p>
            </div>
          </div>
        </motion.div>
        <div className="before-after">
          <motion.div className="before-card" initial={{ opacity: 0, x: reduceMotion ? 0 : -35 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduceMotion ? 0 : 0.65 }}>
            <span className="card-label">DZIŚ</span>
            {["Dzień dobry, ile mam zapłacić ZUS?", "Czy moja faktura dotarła?", "Proszę jeszcze raz wysłać numer konta"].map((message, index) => (
              <motion.div className={`message-bubble ${index === 1 ? "message-right" : "message-left"}`} key={message} initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: reduceMotion ? 0 : 0.18 + index * 0.12 }}>{message}</motion.div>
            ))}
            <div className="chaos-caption"><strong>47 rozproszonych wiadomości</strong><small>WhatsApp, e-mail i SMS</small></div>
          </motion.div>
          <motion.div className="transform-arrow" aria-hidden="true" initial={{ opacity: 0, scale: 0.7 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: reduceMotion ? 0 : 0.3 }}><ArrowRight size={29} /></motion.div>
          <motion.div className="after-card" initial={{ opacity: 0, x: reduceMotion ? 0 : 35 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: reduceMotion ? 0 : 0.65, delay: reduceMotion ? 0 : 0.14 }}>
            <span className="card-label label-mint">Z EPITO</span>
            <motion.div className="calm-number" initial={{ scale: reduceMotion ? 1 : 0.7 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ type: "spring", stiffness: 180, damping: 15 }}>3</motion.div>
            <strong>proste statusy</strong>
            <div className="status-list"><span><i className="green" /> Do zapłaty</span><span><i className="yellow" /> Brakuje dokumentu</span><span><i className="blue" /> Rozliczone</span></div>
            <div className="calm-caption">Klient wie, co dalej. Bez telefonu.</div>
          </motion.div>
        </div>
      </section>

      <section className="features-section" id="funkcje">
        <motion.div className="section-heading" {...reveal}>
          <div><span className="section-kicker light">Co robi Epito</span><h2>Prosty portal.<br />Duża różnica.</h2></div>
          <p>Jedno miejsce dla informacji, o które klienci pytają najczęściej.</p>
        </motion.div>
        <div className="features-grid">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.article className="feature-card" key={feature.number} initial={{ opacity: 0, y: reduceMotion ? 0 : 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: reduceMotion ? 0 : 0.5, delay: reduceMotion ? 0 : index * 0.08 }} whileHover={reduceMotion ? undefined : { y: -7 }}>
                <span className="feature-number">{feature.number}</span>
                <div className="feature-icon" aria-hidden="true"><Icon size={22} /></div>
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </motion.article>
            );
          })}
        </div>
      </section>

      <motion.section className="steps-section" {...reveal}>
        <div className="section-kicker">Jak zacząć</div>
        <h2>Od pliku do spokoju<br />w trzech krokach.</h2>
        <div className="steps-grid">
          {["Dodajesz klientów", "Wgrywasz rozliczenia", "Epito pilnuje reszty"].map((title, index) => (
            <motion.article key={title} whileHover={reduceMotion ? undefined : { y: -5 }}><span>{index + 1}</span><div><h3>{title}</h3><p>{index === 0 ? "Importujesz listę firm i wybierasz, które informacje mają zobaczyć w portalu." : index === 1 ? "Na start wystarczy prosty plik. Docelowo dane będą pobierane z programu księgowego." : "Klient dostaje powiadomienie, płaci i widzi potwierdzenie bez angażowania księgowego."}</p></div></motion.article>
          ))}
        </div>
      </motion.section>

      <motion.section className="pricing-section" id="cennik" initial={{ opacity: 0, y: reduceMotion ? 0 : 36, scale: reduceMotion ? 1 : 0.985 }} whileInView={{ opacity: 1, y: 0, scale: 1 }} viewport={{ once: true, amount: 0.22 }} transition={{ duration: reduceMotion ? 0 : 0.68 }}>
        <div className="pricing-copy">
          <span className="section-kicker light">Program pilotażowy</span>
          <h2>Cena, która zwraca się po kilku telefonach mniej.</h2>
          <p>Wszystkie funkcje portalu, nielimitowane powiadomienia e-mail i bezpośrednie wsparcie przy wdrożeniu.</p>
          <ul><li><Check size={17} /> Bez opłaty wdrożeniowej</li><li><Check size={17} /> Import klientów i danych startowych</li><li><Check size={17} /> Wpływ na rozwój produktu</li></ul>
        </div>
        <motion.div className="pricing-card" whileHover={reduceMotion ? undefined : { y: -7, rotate: -0.4 }} transition={{ type: "spring", stiffness: 220, damping: 20 }}>
          <div className="pilot-badge">PIERWSZE 10 BIUR</div>
          <div className="price-old">299 zł / mies.</div>
          <div className="price"><strong>149</strong><span>zł<br />/ miesiąc</span></div>
          <p>do 30 obsługiwanych firm</p>
          <a className="button button-primary button-wide" href="#pilot">Rezerwuję miejsce <ArrowRight size={19} /></a>
          <small>50% zniżki zostaje z Tobą na stałe.</small>
        </motion.div>
      </motion.section>

      <motion.section className="faq-section" id="faq" {...reveal}>
        <div><span className="section-kicker">Najczęstsze pytania</span><h2>Bez drobnego druku.</h2></div>
        <div className="faq-list">
          {faqs.map(([question, answer], index) => <details key={question} open={index === 0}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}
        </div>
      </motion.section>

      <section className="pilot-section" id="pilot">
        <motion.div className="pilot-copy" {...reveal}>
          <span className="section-kicker light">Zostań współtwórcą</span>
          <h2>Twoi klienci zasługują na prostszą księgowość.</h2>
          <p>Zostaw kontakt. W 20 minut pokażemy Ci demo i sprawdzimy, czy Epito pasuje do pracy Twojego biura.</p>
        </motion.div>
        {sent ? (
          <motion.div className="form-success" role="status" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}><span><Check size={22} /></span><div><strong>Dziękujemy!</strong><p>Zgłoszenie zostało wysłane do zespołu Epito. Odezwiemy się na podany adres e-mail.</p></div></motion.div>
        ) : (
          <motion.form className="pilot-form" onSubmit={submitPilot} initial={{ opacity: 0, y: reduceMotion ? 0 : 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ duration: reduceMotion ? 0 : 0.58 }}>
            <label>Imię i nazwisko<input required name="name" placeholder="Anna Kowalska" autoComplete="name" /></label>
            <label>E-mail służbowy<input required type="email" name="email" placeholder="anna@twojebiuro.pl" autoComplete="email" /></label>
            <label>Liczba obsługiwanych firm<select name="clients" defaultValue="31-100"><option>do 30</option><option>31-100</option><option>powyżej 100</option></select></label>
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }} />
            {pilotError ? <p className="form-error">{pilotError}</p> : null}
            <button className="button button-primary button-wide" type="submit" disabled={pilotPending}>{pilotPending ? "Wysyłanie…" : "Chcę zobaczyć Epito"} <ArrowRight size={19} /></button>
            <small>Bez zobowiązań. Najpierw krótka rozmowa i dopasowane demo.</small>
          </motion.form>
        )}
      </section>

      <footer className="footer">
        <Link className="brand brand-footer" href="/"><span className="brand-mark" aria-hidden="true">E</span><span><strong>EPITO</strong><small>portal dla biur</small></span></Link>
        <p>Spokojniejsza komunikacja między biurem rachunkowym a klientem.</p>
        <div><a href="#funkcje">Funkcje</a><a href="#cennik">Cennik</a><Link href="/panel">Demo panelu</Link><Link href="/logowanie">Logowanie B2B</Link></div>
        <small>© 2026 Epito. Portal klienta dla biur rachunkowych.</small>
      </footer>
    </main>
  );
}
