"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DocumentsWorkspace, SettingsWorkspace, TeamWorkspace, type WorkspaceDocument } from "./workspace-sections";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CreditCard,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Moon,
  Phone,
  ReceiptText,
  Send,
  Settings,
  Sun,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";

type Section = "Pulpit" | "Płatności" | "Dokumenty" | "Wiadomości" | "Zespół" | "Ustawienia";
type Payment = {
  id: number;
  type: string;
  period: string;
  amount: number;
  due: string;
  status: "due" | "paid" | "scheduled";
};

const initialPayments: Payment[] = [
  { id: 1, type: "VAT", period: "lipiec 2026", amount: 7830, due: "20 sierpnia 2026", status: "due" },
  { id: 2, type: "ZUS", period: "lipiec 2026", amount: 1773.96, due: "20 sierpnia 2026", status: "scheduled" },
  { id: 3, type: "PIT", period: "czerwiec 2026", amount: 2640, due: "21 lipca 2026", status: "paid" },
];

const baseDocuments: WorkspaceDocument[] = [
  { id: 1, name: "FV 2026 07 184, Nova Print", meta: "PDF 842 KB, dodano 4 sierpnia", status: "Przetworzone", type: "PDF", year: 2026, month: "Lipiec", category: "Sprzedaż", amount: "4 920,00 zł", pages: 2 },
  { id: 2, name: "Wyciąg bankowy za lipiec", meta: "CSV 128 KB, dodano 3 sierpnia", status: "Przetworzone", type: "CSV", year: 2026, month: "Lipiec", category: "Bank", pages: 6 },
  { id: 3, name: "FV 07 8831, Office Market", meta: "PDF 1,2 MB, dodano 5 sierpnia", status: "W trakcie", type: "PDF", year: 2026, month: "Lipiec", category: "Koszty", amount: "1 248,60 zł", pages: 3 },
  { id: 4, name: "Umowa leasingu pojazdu", meta: "Brakuje załącznika, dodano 5 sierpnia", status: "Do uzupełnienia", type: "PDF", year: 2026, month: "Lipiec", category: "Umowy", pages: 8 },
  { id: 5, name: "FV 2026 07 201, Studio Forma", meta: "PDF 620 KB, dodano 6 sierpnia", status: "Przetworzone", type: "PDF", year: 2026, month: "Lipiec", category: "Sprzedaż", amount: "8 610,00 zł", pages: 1 },
  { id: 6, name: "Faktura za oprogramowanie", meta: "PDF 390 KB, dodano 6 sierpnia", status: "W trakcie", type: "PDF", year: 2026, month: "Lipiec", category: "Koszty", amount: "399,00 zł", pages: 1 },
  { id: 7, name: "Wyciąg bankowy za czerwiec", meta: "CSV 116 KB, dodano 2 lipca", status: "Przetworzone", type: "CSV", year: 2026, month: "Czerwiec", category: "Bank", pages: 5 },
];

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(amount);

const pageMotion = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.22, ease: "easeOut" as const },
};

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
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("epito-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDarkMode(savedTheme ? savedTheme === "dark" : prefersDark);
  }, []);

  const duePayments = payments.filter((payment) => payment.status !== "paid");
  const nextPayment = duePayments[0];

  const navigation: { label: Section; icon: LucideIcon; badge?: string }[] = [
    { label: "Pulpit", icon: LayoutDashboard },
    { label: "Płatności", icon: CreditCard, badge: String(duePayments.length) },
    { label: "Dokumenty", icon: FileText, badge: "2" },
    { label: "Wiadomości", icon: MessageSquareText, badge: "1" },
    { label: "Zespół", icon: Users },
    { label: "Ustawienia", icon: Settings },
  ];

  function selectSection(value: Section) {
    setSection(value);
    setMobileMenu(false);
  }

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      window.localStorage.setItem("epito-theme", next ? "dark" : "light");
      return next;
    });
  }

  function openPayment(payment: Payment) {
    setPaymentSuccess(false);
    setModalPayment(payment);
  }

  function confirmPayment() {
    if (!modalPayment) return;
    setPaying(true);
    window.setTimeout(() => {
      setPayments((current) =>
        current.map((item) => (item.id === modalPayment.id ? { ...item, status: "paid" } : item)),
      );
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
    setDocuments((items) => [
      {
        id: Date.now(),
        name: file.name,
        meta: `${Math.max(1, Math.round(file.size / 1024))} KB, dodano teraz`,
        status: "W trakcie",
        type: file.name.split(".").pop()?.toUpperCase() || "PLIK",
        year: 2026,
        month: "Lipiec",
        category: "Koszty",
        pages: 1,
      },
      ...items,
    ]);
    setSection("Dokumenty");
  }

  return (
    <main className={darkMode ? "portal-shell theme-dark" : "portal-shell"}>
      <aside className={mobileMenu ? "portal-sidebar sidebar-open" : "portal-sidebar"}>
        <div className="portal-brand">
          <span className="brand-mark">E</span>
          <span><strong>EPITO</strong><small>Panel klienta</small></span>
        </div>
        <button className="sidebar-close" type="button" onClick={() => setMobileMenu(false)} aria-label="Zamknij menu"><X size={24} /></button>

        <nav className="portal-nav" aria-label="Nawigacja panelu">
          <small>GŁÓWNE MENU</small>
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.label} className={section === item.label ? "active" : ""} onClick={() => selectSection(item.label)}>
                <Icon className="nav-icon" size={21} strokeWidth={1.9} />
                <span>{item.label}</span>
                {item.badge && <b>{item.badge}</b>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-help">
          <CircleHelp size={24} />
          <strong>Potrzebujesz pomocy?</strong>
          <p>Twój opiekun odpowie na pytania dotyczące rozliczeń.</p>
          <button onClick={() => selectSection("Wiadomości")}>Napisz wiadomość</button>
        </div>
        <Link className="back-to-site" href="/"><ArrowLeft size={16} /> Strona Epito</Link>
      </aside>

      {mobileMenu && <button className="sidebar-backdrop" aria-label="Zamknij menu" onClick={() => setMobileMenu(false)} />}

      <section className="portal-main">
        <header className="portal-topbar">
          <button className="mobile-sidebar-button" onClick={() => setMobileMenu(true)} aria-label="Otwórz menu"><Menu size={24} /></button>
          <button className="company-switcher" type="button">
            <span><Building2 size={20} /></span>
            <div><small>Aktywna firma</small><strong>Kowalski Studio sp. z o.o.</strong></div>
            <ChevronDown size={18} />
          </button>

          <div className="portal-user-actions">
            <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={darkMode ? "Włącz tryb jasny" : "Włącz tryb ciemny"}>
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              <span>{darkMode ? "Tryb jasny" : "Tryb ciemny"}</span>
            </button>

            <div className="notification-wrap">
              <button className="notification-button" onClick={() => setNotificationsOpen((value) => !value)} aria-label="Powiadomienia">
                <Bell size={21} />
                <span>2</span>
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div className="notification-popover" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ duration: 0.18 }}>
                    <div><strong>Powiadomienia</strong><button onClick={() => setNotificationsOpen(false)} aria-label="Zamknij"><X size={20} /></button></div>
                    <p><span className="notification-icon success"><Check size={15} /></span><b>Wyliczenie VAT jest gotowe</b><small>Dzisiaj, 08:42</small></p>
                    <p><span className="notification-icon warning"><FileText size={15} /></span><b>Brakuje umowy leasingu</b><small>Wczoraj, 14:10</small></p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button className="user-profile" type="button">
              <span>MK</span>
              <div><strong>Marcin Kowalski</strong><small>Administrator</small></div>
              <ChevronDown size={18} />
            </button>
          </div>
        </header>

        <div className="portal-page">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div className="portal-view" key={section} {...pageMotion}>
              {section === "Pulpit" && (
                <>
                  <div className="page-heading">
                    <div><p>Czwartek, 6 sierpnia</p><h1>Dzień dobry, Marcin</h1><span>Najważniejsze informacje o Twojej firmie są tutaj.</span></div>
                    <label className="upload-button"><Upload size={18} /> Dodaj dokument<input type="file" onChange={uploadDocument} /></label>
                  </div>

                  <section className="payment-hero-card">
                    <div className="payment-hero-info">
                      <div className="due-icon"><Landmark size={29} /></div>
                      <div><span>NAJBLIŻSZA PŁATNOŚĆ</span><h2>{nextPayment ? `${nextPayment.type} za ${nextPayment.period}` : "Wszystko opłacone"}</h2><p>{nextPayment ? <>Termin płatności <strong>{nextPayment.due}</strong></> : "Nie masz zaległych zobowiązań."}</p></div>
                    </div>
                    {nextPayment ? (
                      <>
                        <div className="payment-hero-amount"><span>DO ZAPŁATY</span><strong>{formatMoney(nextPayment.amount)}</strong></div>
                        <button className="button button-primary pay-button" onClick={() => openPayment(nextPayment)}>Zapłać teraz <ArrowRight size={19} /></button>
                        <div className="deadline-pill"><CalendarDays size={23} /><span><strong>14 dni</strong> do terminu</span></div>
                      </>
                    ) : <div className="all-paid-badge"><Check size={18} /> Rozliczone</div>}
                  </section>

                  <section className="summary-grid">
                    <article>
                      <div className="summary-title"><span className="summary-icon mint"><FolderOpen size={21} /></span><p><small>DOKUMENTY ZA LIPIEC</small><strong>48 z 50</strong></p><b className="trend-up"><TrendingUp size={14} /> 12%</b></div>
                      <div className="progress"><i style={{ width: "96%" }} /></div>
                      <p className="summary-note warning-text">Brakuje 2 dokumentów</p>
                    </article>
                    <article>
                      <div className="summary-title"><span className="summary-icon blue-bg"><Check size={21} /></span><p><small>STATUS KSIĘGOWANIA</small><strong>W toku</strong></p><b className="status-pill-blue">72%</b></div>
                      <div className="progress blue-progress"><i style={{ width: "72%" }} /></div>
                      <p className="summary-note muted">Przewidywane zakończenie 12 sierpnia</p>
                    </article>
                    <article>
                      <div className="summary-title"><span className="summary-icon lilac"><WalletCards size={21} /></span><p><small>KOSZTY ZA LIPIEC</small><strong>21 480 zł</strong></p><b className="trend-down"><TrendingDown size={14} /> 8%</b></div>
                      <div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
                      <p className="summary-note muted">W porównaniu z czerwcem</p>
                    </article>
                  </section>

                  <section className="portal-two-columns">
                    <article className="panel-card">
                      <div className="panel-card-heading"><div><h3>Nadchodzące płatności</h3><p>Zobowiązania na najbliższe 30 dni.</p></div><button onClick={() => selectSection("Płatności")}>Wszystkie <ArrowRight size={16} /></button></div>
                      <div className="payment-list">
                        {payments.map((payment) => (
                          <div className="payment-list-row" key={payment.id}>
                            <span className={`payment-type ${payment.type.toLowerCase()}`}>{payment.type}</span>
                            <div><strong>{payment.type}</strong><small>{payment.period}</small></div>
                            <div className="list-due"><small>Termin</small><strong>{payment.due.replace(" 2026", "")}</strong></div>
                            <strong className="list-amount">{formatMoney(payment.amount)}</strong>
                            {payment.status === "paid" ? <span className="paid-pill"><Check size={13} /> Opłacone</span> : <button className="small-pay" onClick={() => openPayment(payment)}>Zapłać</button>}
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="panel-card">
                      <div className="panel-card-heading"><div><h3>Ostatnie dokumenty</h3><p>Najnowsza aktywność.</p></div><button onClick={() => selectSection("Dokumenty")}>Wszystkie <ArrowRight size={16} /></button></div>
                      <div className="document-mini-list">
                        {documents.slice(0, 3).map((document) => (
                          <div key={document.id}><span>{document.type}</span><div><strong>{document.name}</strong><small>{document.meta}</small></div><b className={document.status === "Przetworzone" ? "done" : "pending"}>{document.status}</b></div>
                        ))}
                      </div>
                    </article>
                  </section>

                  <section className="advisor-banner">
                    <div className="advisor-avatar">AK</div>
                    <div><small>TWÓJ OPIEKUN</small><h3>Anna Kowalska <span className="availability">Dostępna</span></h3><p>Poniedziałek do piątku, od 8:00 do 16:00.</p></div>
                    <button onClick={() => selectSection("Wiadomości")}><MessageSquareText size={17} /> Napisz wiadomość</button>
                    <div className="advisor-phone"><small>TELEFON</small><strong><Phone size={14} /> +48 22 123 45 67</strong></div>
                  </section>
                </>
              )}

              {section === "Płatności" && (
                <section className="subpage">
                  <div className="page-heading"><div><p>Rozliczenia</p><h1>Płatności</h1><span>Kwoty przygotowane przez Twoje biuro rachunkowe.</span></div></div>
                  <div className="subpage-summary">
                    <article><small>DO ZAPŁATY</small><strong>{formatMoney(duePayments.reduce((sum, item) => sum + item.amount, 0))}</strong><span>{duePayments.length} zobowiązania</span></article>
                    <article><small>OPŁACONE W TYM ROKU</small><strong>68 420,00 zł</strong><span>12 płatności</span></article>
                    <article><small>NAJBLIŻSZY TERMIN</small><strong>20 sierpnia</strong><span>Za 14 dni</span></article>
                  </div>
                  <div className="panel-card payments-table-card">
                    <div className="panel-card-heading"><div><h3>Historia płatności</h3><p>To demo. Żaden rachunek nie zostanie obciążony.</p></div></div>
                    <div className="full-payment-list">
                      {payments.map((payment) => (
                        <div key={payment.id}>
                          <span className={`payment-type ${payment.type.toLowerCase()}`}>{payment.type}</span>
                          <div><strong>{payment.type}, {payment.period}</strong><small>Termin {payment.due}</small></div>
                          <strong>{formatMoney(payment.amount)}</strong>
                          <span className={payment.status === "paid" ? "paid-pill" : payment.status === "scheduled" ? "scheduled-pill" : "due-pill"}>{payment.status === "paid" ? "Opłacone" : payment.status === "scheduled" ? "Zaplanowane" : "Do zapłaty"}</span>
                          {payment.status !== "paid" && <button className="small-pay" onClick={() => openPayment(payment)}>Zapłać <ArrowRight size={14} /></button>}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              )}

              {section === "Dokumenty" && <DocumentsWorkspace documents={documents} setDocuments={setDocuments} onUpload={uploadDocument} />}

              {section === "Wiadomości" && (
                <section className="subpage messages-page">
                  <div className="page-heading"><div><p>Kontakt z biurem</p><h1>Wiadomości</h1><span>Wszystkie ustalenia w jednym miejscu.</span></div></div>
                  <div className="messages-layout">
                    <aside><button className="active"><span className="advisor-avatar small">AK</span><div><strong>Anna Kowalska</strong><small>Brakujący dokument</small></div><b>1</b></button></aside>
                    <article className="chat-card">
                      <header><span className="advisor-avatar small">AK</span><div><strong>Anna Kowalska</strong><small>Dostępna</small></div></header>
                      <div className="chat-body">
                        <div className="chat-time">WCZORAJ</div>
                        <div className="chat-message incoming"><p>Dzień dobry, brakuje nam umowy leasingu do zamknięcia lipca. Czy może Pan dodać ją w zakładce Dokumenty?</p><small>14:10</small></div>
                        <div className="chat-message outgoing"><p>Dzień dobry, jasne. Dodam dokument jeszcze dzisiaj.</p><small>14:24</small></div>
                        {messageSent && <motion.div className="chat-message outgoing" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><p>Dziękuję, dokument został już dodany.</p><small>Teraz</small></motion.div>}
                      </div>
                      <footer><input aria-label="Treść wiadomości" placeholder="Napisz wiadomość" /><button onClick={() => setMessageSent(true)}>Wyślij <Send size={16} /></button></footer>
                    </article>
                  </div>
                </section>
              )}

              {section === "Zespół" && <TeamWorkspace />}

              {section === "Ustawienia" && <SettingsWorkspace />}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <AnimatePresence>
        {modalPayment && (
          <motion.div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Płatność demonstracyjna" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="payment-modal" initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.2 }}>
              <button className="modal-close" onClick={closeModal} aria-label="Zamknij"><X size={24} /></button>
              {paymentSuccess ? (
                <div className="payment-success"><span><Check size={30} /></span><h2>Płatność przyjęta</h2><p>Status został zaktualizowany. To demonstracja, więc żadne środki nie zostały pobrane.</p><button className="button button-dark button-wide" onClick={closeModal}>Wróć do panelu</button></div>
              ) : (
                <>
                  <span className="modal-kicker">PŁATNOŚĆ DEMONSTRACYJNA</span>
                  <h2>{modalPayment.type}, {modalPayment.period}</h2>
                  <div className="modal-amount"><small>Kwota do zapłaty</small><strong>{formatMoney(modalPayment.amount)}</strong><span>Termin {modalPayment.due}</span></div>
                  <fieldset>
                    <legend>Wybierz metodę</legend>
                    <label className={paymentMethod === "blik" ? "selected" : ""}><input type="radio" name="method" value="blik" checked={paymentMethod === "blik"} onChange={() => setPaymentMethod("blik")} /><b>BLIK</b><span>Kod 6-cyfrowy</span></label>
                    <label className={paymentMethod === "transfer" ? "selected" : ""}><input type="radio" name="method" value="transfer" checked={paymentMethod === "transfer"} onChange={() => setPaymentMethod("transfer")} /><b><Landmark size={18} /></b><span>Szybki przelew</span></label>
                  </fieldset>
                  {paymentMethod === "blik" && <label className="blik-field">Kod BLIK<input inputMode="numeric" maxLength={6} placeholder="Wpisz 6 cyfr" /></label>}
                  <div className="demo-notice"><CircleHelp size={17} /> To jest interaktywny prototyp. Kliknięcie nie uruchamia prawdziwej płatności.</div>
                  <button className="button button-primary button-wide modal-pay" onClick={confirmPayment} disabled={paying}>{paying ? "Przetwarzanie" : `Potwierdź ${formatMoney(modalPayment.amount)}`} <ArrowRight size={18} /></button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
