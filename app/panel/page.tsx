"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useState } from "react";
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
  CreditCard,
  FileText,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Moon,
  Phone,
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
  id: string | number;
  type: string;
  period: string;
  amount: number;
  due: string;
  status: "due" | "paid" | "scheduled";
};

type PortalMode = "demo" | "production";
type PortalSession = {
  fullName: string;
  email: string;
  platformRole: "none" | "support" | "supervisor";
  membershipRole: "owner" | "admin" | "accountant" | "employee" | "viewer" | null;
};
type PortalOverview = {
  tenant: { id: string; slug: string; display_name: string; legal_name: string; nip: string | null };
  companies: Array<{ id: string; name: string }>;
  team: Array<{ id: string; email: string; full_name: string; role: string; status: string }>;
  documents: Array<{ id: string; name: string; category: string; status: string; document_year: number; document_month: number; amount: string | null; currency: string; company_name: string; created_at: string }>;
  payments: Array<{ id: string; tax_type: string; period_label: string; amount: string; currency: string; due_date: string; status: string; company_name: string; created_at: string }>;
  stats: { clients_count: number; documents_count: number; payments_due_count: number; payments_due_total: string };
};

const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const categoryLabels: Record<string, string> = { sales: "Sprzedaż", costs: "Koszty", bank: "Bank", contracts: "Umowy", tax: "Podatki", other: "Inne" };
const statusLabels: Record<string, string> = { uploaded: "W trakcie", processing: "W trakcie", verified: "Przetworzone", requires_action: "Do uzupełnienia", archived: "Archiwalne" };
const taxLabels: Record<string, string> = { vat: "VAT", pit: "PIT", cit: "CIT", zus: "ZUS", invoice: "Faktura", other: "Inna" };

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "EP";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

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
  return <ClientPortal mode="demo" />;
}

export function ClientPortal({ mode }: { mode: PortalMode }) {
  const router = useRouter();
  const production = mode === "production";
  const [section, setSection] = useState<Section>("Pulpit");
  const [payments, setPayments] = useState<Payment[]>(production ? [] : initialPayments);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>(production ? [] : baseDocuments);
  const [session, setSession] = useState<PortalSession | null>(null);
  const [overview, setOverview] = useState<PortalOverview | null>(null);
  const [loading, setLoading] = useState(production);
  const [loadError, setLoadError] = useState("");
  const [portalNotice, setPortalNotice] = useState("");
  const [modalPayment, setModalPayment] = useState<Payment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("blik");
  const [paying, setPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [messageSent, setMessageSent] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [currentDate] = useState(() => new Date());

  const loadProductionData = useCallback(async () => {
    if (!production) return;
    const [sessionResponse, overviewResponse] = await Promise.all([
      fetch("/api/auth/session", { cache: "no-store" }),
      fetch("/api/workspace/overview", { cache: "no-store" }),
    ]);
    if (sessionResponse.status === 401 || overviewResponse.status === 401) {
      router.replace("/logowanie");
      return;
    }
    const sessionPayload = (await sessionResponse.json()) as { session?: PortalSession; error?: string };
    const overviewPayload = (await overviewResponse.json()) as PortalOverview & { error?: string };
    if (!sessionResponse.ok || !sessionPayload.session) throw new Error(sessionPayload.error || "Nie udało się pobrać sesji.");
    if (!overviewResponse.ok) throw new Error(overviewPayload.error || "Nie udało się pobrać danych panelu.");
    setSession(sessionPayload.session);
    setOverview(overviewPayload);
    setPayments(overviewPayload.payments.map((payment) => ({
      id: payment.id,
      type: taxLabels[payment.tax_type] || payment.tax_type.toUpperCase(),
      period: payment.period_label,
      amount: Number(payment.amount),
      due: formatDate(payment.due_date),
      status: payment.status === "paid" ? "paid" : payment.status === "scheduled" ? "scheduled" : "due",
    })));
    setDocuments(overviewPayload.documents.map((document) => ({
      id: document.id,
      name: document.name,
      meta: `Dodano ${new Date(document.created_at).toLocaleDateString("pl-PL")}`,
      status: statusLabels[document.status] || document.status,
      type: "PLIK",
      year: document.document_year,
      month: monthNames[document.document_month - 1],
      category: categoryLabels[document.category] || document.category,
      amount: document.amount ? formatMoney(Number(document.amount)) : undefined,
      pages: 1,
    })));
  }, [production, router]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("epito-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const animationFrame = window.requestAnimationFrame(() => {
      setDarkMode(savedTheme ? savedTheme === "dark" : prefersDark);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    if (!production) return;
    const frame = window.requestAnimationFrame(() => {
      loadProductionData()
        .catch((reason) => setLoadError(reason instanceof Error ? reason.message : "Nie udało się pobrać danych panelu."))
        .finally(() => setLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadProductionData, production]);

  const duePayments = payments.filter((payment) => payment.status !== "paid");
  const nextPayment = duePayments[0];

  const navigation: { label: Section; icon: LucideIcon; badge?: string }[] = [
    { label: "Pulpit", icon: LayoutDashboard },
    { label: "Płatności", icon: CreditCard, badge: String(duePayments.length) },
    { label: "Dokumenty", icon: FileText, badge: String(documents.filter((document) => document.status !== "Przetworzone").length) },
    { label: "Wiadomości", icon: MessageSquareText, badge: production ? undefined : "1" },
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
    if (production) return;
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

  async function uploadDocument(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (production) {
      const input = event.target;
      setPortalNotice("Przesyłanie dokumentu…");
      try {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch("/api/workspace/documents", { method: "POST", body: form });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Nie udało się przesłać dokumentu.");
        await loadProductionData();
        setPortalNotice("Dokument został zapisany.");
      } catch (reason) {
        setPortalNotice(reason instanceof Error ? reason.message : "Nie udało się przesłać dokumentu.");
      }
      setSection("Dokumenty");
      input.value = "";
      return;
    }
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/logowanie");
  }

  const companyName = overview?.tenant.display_name || "Kowalski Studio sp. z o.o.";
  const legalName = overview?.tenant.legal_name || "Kowalski Studio sp. z o.o.";
  const userName = session?.fullName || "Marcin Kowalski";
  const firstName = userName.split(/\s+/)[0] || userName;
  const userRole = session?.membershipRole === "owner" ? "Właściciel" : session?.membershipRole === "admin" ? "Administrator" : session?.membershipRole === "accountant" ? "Księgowość" : session?.membershipRole === "viewer" ? "Podgląd" : "Pracownik";
  const actionDocuments = documents.filter((document) => document.status !== "Przetworzone").length;
  const paidTotal = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const documentTotal = documents.reduce((sum, document) => sum + Number(String(document.amount || "0").replace(/[^\d,-]/g, "").replace(",", ".")), 0);
  const productionTeam = overview?.team.map((member) => ({ id: member.id, name: member.full_name, email: member.email, role: member.role, status: member.status === "active" ? "Aktywny" : "Zaproszony", initials: initials(member.full_name) }));
  const nearestDueDate = overview?.payments.find((payment) => payment.status !== "paid")?.due_date;
  const daysToDeadline = nearestDueDate ? Math.max(0, Math.ceil((new Date(`${nearestDueDate}T00:00:00`).getTime() - currentDate.getTime()) / 86_400_000)) : 0;
  const todayLabel = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(currentDate);

  if (loading) return <main className={darkMode ? "portal-shell theme-dark" : "portal-shell"}><div className="portal-state"><span className="brand-mark">E</span><h1>Ładowanie panelu</h1><p>Pobieramy aktualne dane Twojej organizacji.</p></div></main>;
  if (production && !overview) return <main className={darkMode ? "portal-shell theme-dark" : "portal-shell"}><div className="portal-state"><span className="brand-mark">E</span><h1>Nie udało się otworzyć panelu</h1><p>{loadError || "Spróbuj zalogować się ponownie."}</p><Link className="button button-primary" href="/logowanie">Przejdź do logowania</Link></div></main>;

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
          <p>{production ? "Zarządzaj firmami i rozliczeniami w zapleczu organizacji." : "Twój opiekun odpowie na pytania dotyczące rozliczeń."}</p>
          <button onClick={() => production ? router.push("/office") : selectSection("Wiadomości")}>{production ? "Otwórz zaplecze" : "Napisz wiadomość"}</button>
        </div>
        {production ? <button className="back-to-site" type="button" onClick={logout}><ArrowLeft size={16} /> Wyloguj się</button> : <Link className="back-to-site" href="/"><ArrowLeft size={16} /> Strona Epito</Link>}
      </aside>

      {mobileMenu && <button className="sidebar-backdrop" aria-label="Zamknij menu" onClick={() => setMobileMenu(false)} />}

      <section className="portal-main">
        <header className="portal-topbar">
          <button className="mobile-sidebar-button" onClick={() => setMobileMenu(true)} aria-label="Otwórz menu"><Menu size={24} /></button>
          <button className="company-switcher" type="button">
            <span><Building2 size={20} /></span>
            <div><small>Aktywna firma</small><strong>{companyName}</strong></div>
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
                {(production ? actionDocuments + duePayments.length : 2) > 0 ? <span>{production ? actionDocuments + duePayments.length : 2}</span> : null}
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div className="notification-popover" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ duration: 0.18 }}>
                    <div><strong>Powiadomienia</strong><button onClick={() => setNotificationsOpen(false)} aria-label="Zamknij"><X size={20} /></button></div>
                    {production ? <><p><span className="notification-icon success"><Check size={15} /></span><b>{duePayments.length} płatności oczekuje</b><small>Dane bieżące</small></p><p><span className="notification-icon warning"><FileText size={15} /></span><b>{actionDocuments} dokumentów wymaga uwagi</b><small>Dane bieżące</small></p></> : <><p><span className="notification-icon success"><Check size={15} /></span><b>Wyliczenie VAT jest gotowe</b><small>Dzisiaj, 08:42</small></p><p><span className="notification-icon warning"><FileText size={15} /></span><b>Brakuje umowy leasingu</b><small>Wczoraj, 14:10</small></p></>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button className="user-profile" type="button">
              <span>{initials(userName)}</span>
              <div><strong>{userName}</strong><small>{userRole}</small></div>
              <ChevronDown size={18} />
            </button>
          </div>
        </header>

        <div className="portal-page">
          <AnimatePresence>{portalNotice ? <motion.div className="portal-inline-notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><span>{portalNotice}</span><button type="button" onClick={() => setPortalNotice("")} aria-label="Zamknij komunikat"><X size={18} /></button></motion.div> : null}</AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div className="portal-view" key={section} {...pageMotion}>
              {section === "Pulpit" && (
                <>
                  <div className="page-heading">
                    <div><p>{production ? todayLabel : "Czwartek, 6 sierpnia"}</p><h1>Dzień dobry, {firstName}</h1><span>Najważniejsze informacje o Twojej firmie są tutaj.</span></div>
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
                        <div className="deadline-pill"><CalendarDays size={23} /><span><strong>{production ? `${daysToDeadline} dni` : "14 dni"}</strong> do terminu</span></div>
                      </>
                    ) : <div className="all-paid-badge"><Check size={18} /> Rozliczone</div>}
                  </section>

                  <section className="summary-grid">
                    <article>
                      <div className="summary-title"><span className="summary-icon mint"><FolderOpen size={21} /></span><p><small>WSZYSTKIE DOKUMENTY</small><strong>{production ? documents.length : "48 z 50"}</strong></p><b className="trend-up"><TrendingUp size={14} /> {production ? "Baza" : "12%"}</b></div>
                      <div className="progress"><i style={{ width: production ? (documents.length ? `${Math.round(((documents.length - actionDocuments) / documents.length) * 100)}%` : "0%") : "96%" }} /></div>
                      <p className="summary-note warning-text">{production ? `${actionDocuments} wymaga uwagi` : "Brakuje 2 dokumentów"}</p>
                    </article>
                    <article>
                      <div className="summary-title"><span className="summary-icon blue-bg"><Check size={21} /></span><p><small>STATUS KSIĘGOWANIA</small><strong>{actionDocuments ? "W toku" : "Aktualne"}</strong></p><b className="status-pill-blue">{production ? `${documents.length - actionDocuments}/${documents.length}` : "72%"}</b></div>
                      <div className="progress blue-progress"><i style={{ width: production ? (documents.length ? `${Math.round(((documents.length - actionDocuments) / documents.length) * 100)}%` : "0%") : "72%" }} /></div>
                      <p className="summary-note muted">{production ? "Stan według danych zapisanych w systemie" : "Przewidywane zakończenie 12 sierpnia"}</p>
                    </article>
                    <article>
                      <div className="summary-title"><span className="summary-icon lilac"><WalletCards size={21} /></span><p><small>WARTOŚĆ DOKUMENTÓW</small><strong>{production ? formatMoney(documentTotal) : "21 480 zł"}</strong></p><b className="trend-down"><TrendingDown size={14} /> {production ? documents.length : "8%"}</b></div>
                      <div className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
                      <p className="summary-note muted">{production ? "Suma dokumentów z podaną kwotą" : "W porównaniu z czerwcem"}</p>
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
                        {payments.length === 0 ? <div className="portal-empty-row">Nie ma jeszcze żadnych płatności.</div> : null}
                      </div>
                    </article>

                    <article className="panel-card">
                      <div className="panel-card-heading"><div><h3>Ostatnie dokumenty</h3><p>Najnowsza aktywność.</p></div><button onClick={() => selectSection("Dokumenty")}>Wszystkie <ArrowRight size={16} /></button></div>
                      <div className="document-mini-list">
                        {documents.slice(0, 3).map((document) => (
                          <div key={document.id}><span>{document.type}</span><div><strong>{document.name}</strong><small>{document.meta}</small></div><b className={document.status === "Przetworzone" ? "done" : "pending"}>{document.status}</b></div>
                        ))}
                        {documents.length === 0 ? <div className="portal-empty-row">Nie ma jeszcze żadnych dokumentów.</div> : null}
                      </div>
                    </article>
                  </section>

                  <section className="advisor-banner">
                    <div className="advisor-avatar">{production ? initials(companyName) : "AK"}</div>
                    <div><small>{production ? "TWOJA ORGANIZACJA" : "TWÓJ OPIEKUN"}</small><h3>{production ? companyName : "Anna Kowalska"} <span className="availability">Aktywna</span></h3><p>{production ? legalName : "Poniedziałek do piątku, od 8:00 do 16:00."}</p></div>
                    <button onClick={() => production ? router.push("/office") : selectSection("Wiadomości")}><MessageSquareText size={17} /> {production ? "Zarządzaj danymi" : "Napisz wiadomość"}</button>
                    <div className="advisor-phone"><small>{production ? "NIP" : "TELEFON"}</small><strong><Phone size={14} /> {production ? overview?.tenant.nip || "Nie podano" : "+48 22 123 45 67"}</strong></div>
                  </section>
                </>
              )}

              {section === "Płatności" && (
                <section className="subpage">
                  <div className="page-heading"><div><p>Rozliczenia</p><h1>Płatności</h1><span>Kwoty przygotowane przez Twoje biuro rachunkowe.</span></div></div>
                  <div className="subpage-summary">
                    <article><small>DO ZAPŁATY</small><strong>{formatMoney(duePayments.reduce((sum, item) => sum + item.amount, 0))}</strong><span>{duePayments.length} zobowiązania</span></article>
                    <article><small>OPŁACONE W TYM ROKU</small><strong>{production ? formatMoney(paidTotal) : "68 420,00 zł"}</strong><span>{payments.filter((payment) => payment.status === "paid").length} płatności</span></article>
                    <article><small>NAJBLIŻSZY TERMIN</small><strong>{nextPayment?.due || "Brak"}</strong><span>{nextPayment ? `Za ${production ? daysToDeadline : 14} dni` : "Wszystko rozliczone"}</span></article>
                  </div>
                  <div className="panel-card payments-table-card">
                    <div className="panel-card-heading"><div><h3>Historia płatności</h3><p>{production ? "Dane zapisane dla bieżącej organizacji." : "To demo. Żaden rachunek nie zostanie obciążony."}</p></div></div>
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
                      {payments.length === 0 ? <div className="portal-empty-row">Nie ma jeszcze płatności do wyświetlenia.</div> : null}
                    </div>
                  </div>
                </section>
              )}

              {section === "Dokumenty" && <DocumentsWorkspace documents={documents} setDocuments={setDocuments} onUpload={uploadDocument} production={production} onChanged={loadProductionData} onNotice={setPortalNotice} />}

              {section === "Wiadomości" && production ? (
                <section className="subpage messages-page"><div className="page-heading"><div><p>Kontakt z biurem</p><h1>Wiadomości</h1><span>Wszystkie ustalenia będą dostępne w jednym miejscu.</span></div></div><div className="panel-card portal-empty-state"><MessageSquareText size={34} /><h3>Brak wiadomości</h3><p>Moduł nie pokazuje treści demonstracyjnych na kontach produkcyjnych.</p></div></section>
              ) : section === "Wiadomości" ? (
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
              ) : null}

              {section === "Zespół" && <TeamWorkspace initialMembers={production ? productionTeam : undefined} organizationName={companyName} production={production} onChanged={loadProductionData} />}

              {section === "Ustawienia" && <SettingsWorkspace production={production} organization={overview ? { displayName: overview.tenant.display_name, legalName: overview.tenant.legal_name, nip: overview.tenant.nip, slug: overview.tenant.slug } : undefined} onChanged={loadProductionData} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>

      <AnimatePresence>
        {modalPayment && (
          <motion.div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={production ? "Szczegóły płatności" : "Płatność demonstracyjna"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="payment-modal" initial={{ opacity: 0, scale: 0.96, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 10 }} transition={{ duration: 0.2 }}>
              <button className="modal-close" onClick={closeModal} aria-label="Zamknij"><X size={24} /></button>
              {paymentSuccess ? (
                <div className="payment-success"><span><Check size={30} /></span><h2>Płatność przyjęta</h2><p>Status został zaktualizowany. To demonstracja, więc żadne środki nie zostały pobrane.</p><button className="button button-dark button-wide" onClick={closeModal}>Wróć do panelu</button></div>
              ) : (
                <>
                  <span className="modal-kicker">{production ? "SZCZEGÓŁY PŁATNOŚCI" : "PŁATNOŚĆ DEMONSTRACYJNA"}</span>
                  <h2>{modalPayment.type}, {modalPayment.period}</h2>
                  <div className="modal-amount"><small>Kwota do zapłaty</small><strong>{formatMoney(modalPayment.amount)}</strong><span>Termin {modalPayment.due}</span></div>
                  {!production ? <fieldset>
                    <legend>Wybierz metodę</legend>
                    <label className={paymentMethod === "blik" ? "selected" : ""}><input type="radio" name="method" value="blik" checked={paymentMethod === "blik"} onChange={() => setPaymentMethod("blik")} /><b>BLIK</b><span>Kod 6-cyfrowy</span></label>
                    <label className={paymentMethod === "transfer" ? "selected" : ""}><input type="radio" name="method" value="transfer" checked={paymentMethod === "transfer"} onChange={() => setPaymentMethod("transfer")} /><b><Landmark size={18} /></b><span>Szybki przelew</span></label>
                  </fieldset> : null}
                  {!production && paymentMethod === "blik" && <label className="blik-field">Kod BLIK<input inputMode="numeric" maxLength={6} placeholder="Wpisz 6 cyfr" /></label>}
                  <div className="demo-notice"><CircleHelp size={17} /> {production ? "Płatności online zostaną uruchomione po podłączeniu operatora płatności. System nie oznaczy zobowiązania jako opłacone bez potwierdzenia." : "To jest interaktywny prototyp. Kliknięcie nie uruchamia prawdziwej płatności."}</div>
                  {production ? <button className="button button-dark button-wide" onClick={closeModal}>Zamknij</button> : <button className="button button-primary button-wide modal-pay" onClick={confirmPayment} disabled={paying}>{paying ? "Przetwarzanie" : `Potwierdź ${formatMoney(modalPayment.amount)}`} <ArrowRight size={18} /></button>}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
