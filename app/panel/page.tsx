"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";

type Section = "Pulpit" | "Płatności" | "Dokumenty" | "Wiadomości";
type Payment = {
  id: number;
  type: string;
  period: string;
  amount: number;
  due: string;
  status: "due" | "paid" | "scheduled";
};

const initialPayments: Payment[] = [
  { id: 1, type: "VAT", period: "Lipiec 2026", amount: 7830, due: "20 sierpnia 2026", status: "due" },
  { id: 2, type: "ZUS", period: "Lipiec 2026", amount: 1773.96, due: "20 sierpnia 2026", status: "scheduled" },
  { id: 3, type: "PIT", period: "Czerwiec 2026", amount: 2640, due: "21 lipca 2026", status: "paid" },
];

const baseDocuments = [
  { id: 1, name: "Faktury sprzedażowe — lipiec", meta: "28 plików • dodano 4 sierpnia", status: "Przetworzone", type: "PDF" },
  { id: 2, name: "Wyciąg bankowy — lipiec", meta: "1 plik • dodano 3 sierpnia", status: "Przetworzone", type: "CSV" },
  { id: 3, name: "Faktury kosztowe — lipiec", meta: "19 plików • dodano 5 sierpnia", status: "W trakcie", type: "ZIP" },
  { id: 4, name: "Umowa leasingu", meta: "Brakuje dokumentu", status: "Do uzupełnienia", type: "!" },
];

const formatMoney = (amount: number) => new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(amount);

export default function ClientPanel() {
  const [section, setSection] = useState<Section>("Pulpit");
  const [payments, setPayments] = useState(initialPayments);
  const [documents, setDocuments] = useState(baseDocuments);
  const [modalPayment, setModalPayment] = useState<Payment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("blik");
  const [paying, setPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  const duePayments = payments.filter((payment) => payment.status !== "paid");

  function openPayment(payment: Payment) {
    setPaymentSuccess(false);
    setModalPayment(payment);
  }

  function confirmPayment() {
    if (!modalPayment) return;
    setPaying(true);
    window.setTimeout(() => {
      setPayments((current) => current.map((item) => item.id === modalPayment.id ? { ...item, status: "paid" } : item));
      setPaying(false);
      setPaymentSuccess(true);
    }, 750);
  }

  function closeModal() {
    setModalPayment(null);
    setPaymentSuccess(false);
    setPaying(false);
  }

  function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setDocuments((items) => [{
      id: Date.now(),
      name: file.name,
      meta: `${Math.max(1, Math.round(file.size / 1024))} KB • dodano teraz`,
      status: "W trakcie",
      type: file.name.split(".").pop()?.toUpperCase() || "PLIK",
    }, ...items]);
    setSection("Dokumenty");
  }

  const navigation: { label: Section; icon: string; badge?: string }[] = [
    { label: "Pulpit", icon: "⌂" },
    { label: "Płatności", icon: "₿", badge: String(duePayments.length) },
    { label: "Dokumenty", icon: "□", badge: "2" },
    { label: "Wiadomości", icon: "✉", badge: "1" },
  ];

  return (
    <main className="portal-shell">
      <aside className={mobileMenu ? "portal-sidebar sidebar-open" : "portal-sidebar"}>
        <div className="portal-brand"><span className="brand-mark">S</span><span><strong>SALDO</strong><small>Panel klienta</small></span></div>
        <button className="sidebar-close" type="button" onClick={() => setMobileMenu(false)} aria-label="Zamknij menu">×</button>
        <nav className="portal-nav" aria-label="Nawigacja panelu">
          <small>MENU</small>
          {navigation.map((item) => (
            <button key={item.label} className={section === item.label ? "active" : ""} onClick={() => { setSection(item.label); setMobileMenu(false); }}>
              <span className="nav-icon">{item.icon}</span>{item.label}{item.badge && <b>{item.badge}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-help"><span>?</span><strong>Potrzebujesz pomocy?</strong><p>Napisz do swojego opiekuna w biurze.</p><button onClick={() => setSection("Wiadomości")}>Napisz wiadomość</button></div>
        <Link className="back-to-site" href="/">← Wróć na stronę Saldo</Link>
      </aside>

      {mobileMenu && <button className="sidebar-backdrop" aria-label="Zamknij menu" onClick={() => setMobileMenu(false)} />}

      <section className="portal-main">
        <header className="portal-topbar">
          <button className="mobile-sidebar-button" onClick={() => setMobileMenu(true)} aria-label="Otwórz menu"><span /><span /><span /></button>
          <div className="company-switcher"><span>KS</span><div><small>Firma</small><strong>Kowalski Studio sp. z o.o.</strong></div><b>⌄</b></div>
          <div className="portal-user-actions">
            <div className="notification-wrap">
              <button className="notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Powiadomienia">♢<span>2</span></button>
              {notificationsOpen && (
                <div className="notification-popover">
                  <div><strong>Powiadomienia</strong><button onClick={() => setNotificationsOpen(false)}>×</button></div>
                  <p><span className="green">✓</span><b>Wyliczenie VAT jest gotowe</b><small>Dzisiaj, 08:42</small></p>
                  <p><span className="yellow">!</span><b>Brakuje umowy leasingu</b><small>Wczoraj, 14:10</small></p>
                </div>
              )}
            </div>
            <div className="user-profile"><span>MK</span><div><strong>Marcin Kowalski</strong><small>Administrator</small></div><b>⌄</b></div>
          </div>
        </header>

        <div className="portal-page">
          {section === "Pulpit" && (
            <>
              <div className="page-heading"><div><p>Czwartek, 6 sierpnia</p><h1>Dzień dobry, Marcin!</h1><span>Oto najważniejsze informacje o Twojej firmie.</span></div><label className="upload-button">+ Dodaj dokument<input type="file" onChange={uploadDocument} /></label></div>

              <section className="payment-hero-card">
                <div className="payment-hero-info"><div className="due-icon">₿</div><div><span>NAJBLIŻSZA PŁATNOŚĆ</span><h2>{duePayments[0] ? `${duePayments[0].type} za ${duePayments[0].period.toLowerCase()}` : "Wszystko opłacone"}</h2><p>{duePayments[0] ? <>Termin płatności: <strong>{duePayments[0].due}</strong></> : "Nie masz żadnych zaległych zobowiązań."}</p></div></div>
                {duePayments[0] ? <><div className="payment-hero-amount"><span>DO ZAPŁATY</span><strong>{formatMoney(duePayments[0].amount)}</strong></div><button className="button button-primary pay-button" onClick={() => openPayment(duePayments[0])}>Zapłać teraz <span>→</span></button><div className="deadline-pill"><strong>14</strong><span>dni<br />do terminu</span></div></> : <div className="all-paid-badge">✓ Rozliczone</div>}
              </section>

              <section className="summary-grid">
                <article><div className="summary-title"><span className="summary-icon mint">□</span><p><small>DOKUMENTY — LIPIEC</small><strong>48 z 50</strong></p><b className="trend-up">↗ 12%</b></div><div className="progress"><i style={{ width: "96%" }} /></div><p className="summary-note"><span className="yellow-dot" /> Brakuje 2 dokumentów</p></article>
                <article><div className="summary-title"><span className="summary-icon blue-bg">✓</span><p><small>STATUS KSIĘGOWANIA</small><strong>W toku</strong></p><b className="status-pill-blue">72%</b></div><div className="progress blue-progress"><i style={{ width: "72%" }} /></div><p className="summary-note muted">Przewidywane zakończenie: 12 sierpnia</p></article>
                <article><div className="summary-title"><span className="summary-icon lilac">↗</span><p><small>KOSZTY — LIPIEC</small><strong>21 480 zł</strong></p><b className="trend-down">↘ 8%</b></div><div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div><p className="summary-note muted">w porównaniu z czerwcem</p></article>
              </section>

              <section className="portal-two-columns">
                <article className="panel-card">
                  <div className="panel-card-heading"><div><h3>Nadchodzące płatności</h3><p>Twoje zobowiązania na najbliższe 30 dni.</p></div><button onClick={() => setSection("Płatności")}>Zobacz wszystkie →</button></div>
                  <div className="payment-list">
                    {payments.slice(0, 3).map((payment) => (
                      <div className="payment-list-row" key={payment.id}>
                        <span className={`payment-type ${payment.type.toLowerCase()}`}>{payment.type.slice(0, 1)}</span>
                        <div><strong>{payment.type}</strong><small>{payment.period}</small></div>
                        <div className="list-due"><small>Termin</small><strong>{payment.due.replace(" 2026", "")}</strong></div>
                        <strong className="list-amount">{formatMoney(payment.amount)}</strong>
                        {payment.status === "paid" ? <span className="paid-pill">✓ Opłacone</span> : <button className="small-pay" onClick={() => openPayment(payment)}>Zapłać</button>}
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel-card">
                  <div className="panel-card-heading"><div><h3>Ostatnie dokumenty</h3><p>Najnowsza aktywność w dokumentach.</p></div><button onClick={() => setSection("Dokumenty")}>Wszystkie →</button></div>
                  <div className="document-mini-list">
                    {documents.slice(0, 3).map((document) => (
                      <div key={document.id}><span>{document.type}</span><div><strong>{document.name}</strong><small>{document.meta}</small></div><b className={document.status === "Przetworzone" ? "done" : "pending"}>{document.status}</b></div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="advisor-banner"><div className="advisor-avatar">AK<span>●</span></div><div><small>TWÓJ OPIEKUN</small><h3>Anna Kowalska</h3><p>Masz pytanie? Jestem dostępna od poniedziałku do piątku, 8:00–16:00.</p></div><button onClick={() => setSection("Wiadomości")}>✉ Napisz wiadomość</button><div className="advisor-phone"><small>TELEFON</small><strong>+48 22 123 45 67</strong></div></section>
            </>
          )}

          {section === "Płatności" && (
            <section className="subpage">
              <div className="page-heading"><div><p>Rozliczenia</p><h1>Płatności</h1><span>Kwoty przygotowane przez Twoje biuro rachunkowe.</span></div></div>
              <div className="subpage-summary"><article><small>DO ZAPŁATY</small><strong>{formatMoney(duePayments.reduce((sum, item) => sum + item.amount, 0))}</strong><span>{duePayments.length} zobowiązania</span></article><article><small>OPŁACONE W TYM ROKU</small><strong>68 420,00 zł</strong><span>12 płatności</span></article><article><small>NAJBLIŻSZY TERMIN</small><strong>20 sierpnia</strong><span>za 14 dni</span></article></div>
              <div className="panel-card payments-table-card"><div className="panel-card-heading"><div><h3>Historia i nadchodzące płatności</h3><p>Dane demonstracyjne — płatność nie obciąży rachunku.</p></div></div><div className="full-payment-list">{payments.map((payment) => <div key={payment.id}><span className={`payment-type ${payment.type.toLowerCase()}`}>{payment.type[0]}</span><div><strong>{payment.type} — {payment.period}</strong><small>Termin: {payment.due}</small></div><strong>{formatMoney(payment.amount)}</strong><span className={payment.status === "paid" ? "paid-pill" : payment.status === "scheduled" ? "scheduled-pill" : "due-pill"}>{payment.status === "paid" ? "✓ Opłacone" : payment.status === "scheduled" ? "◷ Zaplanowane" : "Do zapłaty"}</span>{payment.status !== "paid" && <button className="small-pay" onClick={() => openPayment(payment)}>Zapłać →</button>}</div>)}</div></div>
            </section>
          )}

          {section === "Dokumenty" && (
            <section className="subpage">
              <div className="page-heading"><div><p>Bezpieczne archiwum</p><h1>Dokumenty</h1><span>Przekazuj pliki i śledź ich status.</span></div><label className="upload-button">+ Dodaj dokument<input type="file" onChange={uploadDocument} /></label></div>
              <label className="drop-zone"><input type="file" onChange={uploadDocument} /><span>↑</span><strong>Przeciągnij plik lub kliknij, aby dodać</strong><small>PDF, JPG, PNG, CSV lub ZIP • maks. 20 MB</small></label>
              <div className="panel-card documents-card"><div className="panel-card-heading"><div><h3>Dokumenty firmy</h3><p>{documents.length} pozycji</p></div><button>Filtruj ⌄</button></div><div className="documents-table">{documents.map((document) => <div key={document.id}><span className={document.type === "!" ? "file-icon alert" : "file-icon"}>{document.type}</span><div><strong>{document.name}</strong><small>{document.meta}</small></div><span className={document.status === "Przetworzone" ? "doc-status done" : document.status === "Do uzupełnienia" ? "doc-status missing" : "doc-status pending"}>{document.status}</span><button aria-label={`Więcej opcji dla ${document.name}`}>•••</button></div>)}</div></div>
            </section>
          )}

          {section === "Wiadomości" && (
            <section className="subpage messages-page">
              <div className="page-heading"><div><p>Kontakt z biurem</p><h1>Wiadomości</h1><span>Wszystkie ustalenia w jednym wątku.</span></div></div>
              <div className="messages-layout"><aside><button className="active"><span className="advisor-avatar small">AK</span><div><strong>Anna Kowalska</strong><small>Brakujący dokument</small></div><b>1</b></button></aside><article className="chat-card"><header><span className="advisor-avatar small">AK</span><div><strong>Anna Kowalska</strong><small><i /> Dostępna</small></div></header><div className="chat-body"><div className="chat-time">WCZORAJ</div><div className="chat-message incoming"><p>Dzień dobry, brakuje nam umowy leasingu do zamknięcia lipca. Czy może Pan dodać ją w zakładce Dokumenty?</p><small>14:10</small></div><div className="chat-message outgoing"><p>Dzień dobry, jasne — dodam dokument jeszcze dzisiaj.</p><small>14:24 ✓✓</small></div>{messageSent && <div className="chat-message outgoing"><p>Dziękuję, dokument został już dodany.</p><small>teraz ✓</small></div>}</div><footer><input aria-label="Treść wiadomości" placeholder="Napisz wiadomość…" /><button onClick={() => setMessageSent(true)}>Wyślij →</button></footer></article></div>
            </section>
          )}
        </div>
      </section>

      {modalPayment && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Płatność demonstracyjna">
          <div className="payment-modal">
            <button className="modal-close" onClick={closeModal} aria-label="Zamknij">×</button>
            {paymentSuccess ? (
              <div className="payment-success"><span>✓</span><h2>Płatność przyjęta</h2><p>Status zobowiązania został zaktualizowany. To demonstracja — żadne środki nie zostały pobrane.</p><button className="button button-dark button-wide" onClick={closeModal}>Wróć do panelu</button></div>
            ) : (
              <>
                <span className="modal-kicker">PŁATNOŚĆ DEMONSTRACYJNA</span><h2>{modalPayment.type} — {modalPayment.period}</h2><div className="modal-amount"><small>Kwota do zapłaty</small><strong>{formatMoney(modalPayment.amount)}</strong><span>Termin: {modalPayment.due}</span></div>
                <fieldset><legend>Wybierz metodę</legend><label className={paymentMethod === "blik" ? "selected" : ""}><input type="radio" name="method" value="blik" checked={paymentMethod === "blik"} onChange={() => setPaymentMethod("blik")} /><b>BLIK</b><span>Kod 6-cyfrowy</span></label><label className={paymentMethod === "transfer" ? "selected" : ""}><input type="radio" name="method" value="transfer" checked={paymentMethod === "transfer"} onChange={() => setPaymentMethod("transfer")} /><b>↗</b><span>Szybki przelew</span></label></fieldset>
                {paymentMethod === "blik" && <label className="blik-field">Kod BLIK<input inputMode="numeric" maxLength={6} placeholder="• • • • • •" /></label>}
                <div className="demo-notice">ⓘ To jest interaktywny prototyp. Kliknięcie nie uruchamia prawdziwej płatności.</div>
                <button className="button button-primary button-wide modal-pay" onClick={confirmPayment} disabled={paying}>{paying ? "Przetwarzanie…" : `Potwierdź ${formatMoney(modalPayment.amount)}`} <span>→</span></button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
