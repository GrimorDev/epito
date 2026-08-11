"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, CSSProperties, useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DocumentImportModal, DocumentsWorkspace, IssueInvoiceModal, SettingsWorkspace, TeamWorkspace, type WorkspaceDocument } from "./workspace-sections";
import { isPlatformStaff, platformRoleLabels, type PlatformRole } from "@/lib/platform-access";
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
  ShieldCheck,
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
  reference?: string | null;
  isReceivable?: boolean;
};

type PortalMode = "demo" | "production";
type PortalSession = {
  fullName: string;
  email: string;
  platformRole: PlatformRole;
  membershipRole: "owner" | "admin" | "accountant" | "employee" | "viewer" | null;
};
type PortalOverview = {
  tenant: { id: string; slug: string; display_name: string; legal_name: string; nip: string | null; settings: { branding?: { accentColor?: string; headerName?: string; logoKey?: string }; notifications?: { email?: boolean; paymentReminders?: boolean } } };
  companies: Array<{ id: string; name: string }>;
  team: Array<{ id: string; email: string; full_name: string; role: string; status: string }>;
  documents: Array<{ id: string; name: string; category: string; status: string; document_year: number; document_month: number; amount: string | null; currency: string; issued_at: string | null; mime_type: string; file_size: number; structured_data: { analysis?: WorkspaceDocument["analysis"]; manual_override?: Record<string, unknown> }; company_name: string; created_at: string; issued_invoice_id: string | null; issued_invoice_status: string | null; issued_invoice_error: string | null }>;
  payments: Array<{ id: string; tax_type: string; period_label: string; amount: string; currency: string; due_date: string; status: string; company_name: string; created_at: string; payment_reference: string | null; payment_source: string | null }>;
  stats: { clients_count: number; documents_count: number; payments_due_count: number; payments_due_total: string };
  bankTransactions: Array<{ id: string; client_company_id: string; company_name: string; value_date: string; amount: string; currency: string; description: string; match_status: string; matched_payment_id: string | null }>;
};

const monthNames = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const categoryLabels: Record<string, string> = { sales: "Sprzedaż", costs: "Koszty", bank: "Bank", contracts: "Umowy", tax: "Podatki", other: "Inne" };
const statusLabels: Record<string, string> = { uploaded: "W kolejce", processing: "Analiza trwa", verified: "Odczytano", requires_action: "Sprawdź dane", archived: "Archiwalne" };
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
  { id: 1, name: "FV 2026 07 184, Nova Print", meta: "PDF 842 KB, dodano 4 sierpnia", status: "Przetworzone", type: "PDF", year: 2026, month: "Lipiec", category: "Sprzedaż", amount: "4 920,00 zł", pages: 2, issuedInvoiceId: "demo-invoice-1", issuedInvoiceStatus: "accepted" },
  { id: 2, name: "Wyciąg bankowy za lipiec", meta: "CSV 128 KB, dodano 3 sierpnia", status: "Przetworzone", type: "CSV", year: 2026, month: "Lipiec", category: "Bank", pages: 6 },
  { id: 3, name: "FV 07 8831, Office Market", meta: "PDF 1,2 MB, dodano 5 sierpnia", status: "W trakcie", type: "PDF", year: 2026, month: "Lipiec", category: "Koszty", amount: "1 248,60 zł", pages: 3 },
  { id: 4, name: "Umowa leasingu pojazdu", meta: "Brakuje załącznika, dodano 5 sierpnia", status: "Do uzupełnienia", type: "PDF", year: 2026, month: "Lipiec", category: "Umowy", pages: 8 },
  { id: 5, name: "FV 2026 07 201, Studio Forma", meta: "PDF 620 KB, dodano 6 sierpnia", status: "Przetworzone", type: "PDF", year: 2026, month: "Lipiec", category: "Sprzedaż", amount: "8 610,00 zł", pages: 1, issuedInvoiceId: "demo-invoice-5", issuedInvoiceStatus: "rejected", issuedInvoiceError: "Kod 450: rachunek odbiorcy wymaga weryfikacji." },
  { id: 6, name: "Faktura za oprogramowanie", meta: "PDF 390 KB, dodano 6 sierpnia", status: "W trakcie", type: "PDF", year: 2026, month: "Lipiec", category: "Koszty", amount: "399,00 zł", pages: 1, issuedInvoiceId: "demo-invoice-6", issuedInvoiceStatus: "queued" },
  { id: 7, name: "Wyciąg bankowy za czerwiec", meta: "CSV 116 KB, dodano 2 lipca", status: "Przetworzone", type: "CSV", year: 2026, month: "Czerwiec", category: "Bank", pages: 5 },
];

const formatMoney = (amount: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(amount);

function formatDocumentMoney(amount: string, currency: string) {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(Number(amount));
}

// A tenant's own subdomain (client2393.epito.pl) redirects "/" straight to
// /logowanie (see proxy.ts) — a plain relative "/#faq" link from inside the
// dashboard would just bounce back to the login screen instead of reaching
// the marketing site's FAQ. Strip the tenant label so the link points at the
// shared base domain instead. Falls back to a relative link when there's no
// subdomain to strip (demo/local/base-domain access).
function marketingFaqUrl(): string {
  if (typeof window === "undefined") return "/#faq";
  const labels = window.location.hostname.split(".");
  if (labels.length <= 2) return "/#faq";
  return `${window.location.protocol}//${labels.slice(1).join(".")}/#faq`;
}

function documentType(mimeType: string, name: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === "text/csv") return "CSV";
  if (mimeType.includes("xml")) return "XML";
  if (mimeType.startsWith("image/")) return mimeType.endsWith("png") ? "PNG" : "JPG";
  return name.split(".").pop()?.toUpperCase() || "PLIK";
}

function fileSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

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
  const [showImportModal, setShowImportModal] = useState(false);
  const [showIssueInvoiceModal, setShowIssueInvoiceModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("blik");
  const [paying, setPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [matchDrafts, setMatchDrafts] = useState<Record<string, string>>({});
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [seenNotificationIds, setSeenNotificationIds] = useState<{ payments: string[]; documents: string[] }>(() => {
    if (typeof window === "undefined") return { payments: [], documents: [] };
    try {
      const raw = window.localStorage.getItem("epito-notifications-seen");
      const parsed = raw ? JSON.parse(raw) : null;
      return { payments: Array.isArray(parsed?.payments) ? parsed.payments : [], documents: Array.isArray(parsed?.documents) ? parsed.documents : [] };
    } catch {
      return { payments: [], documents: [] };
    }
  });
  const [profileOpen, setProfileOpen] = useState(false);
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
      reference: payment.payment_reference,
      isReceivable: payment.payment_source === "issued_invoice",
    })));
    setDocuments(overviewPayload.documents.map((document) => ({
      id: document.id,
      name: document.name,
      status: statusLabels[document.status] || document.status,
      type: documentType(document.mime_type, document.name),
      year: document.document_year,
      month: monthNames[document.document_month - 1],
      category: categoryLabels[document.category] || document.category,
      amount: document.amount ? formatDocumentMoney(document.amount, document.currency) : undefined,
      pages: Number(document.structured_data?.analysis?.page_count || 1),
      mimeType: document.mime_type,
      fileSize: document.file_size,
      meta: `${documentType(document.mime_type, document.name)} ${fileSizeLabel(document.file_size)}, dodano ${new Date(document.created_at).toLocaleDateString("pl-PL")}`,
      categoryCode: document.category,
      statusCode: document.status,
      currency: document.currency,
      issuedAt: document.issued_at,
      analysis: document.structured_data?.analysis || null,
      manualOverride: Boolean(document.structured_data?.manual_override),
      issuedInvoiceId: document.issued_invoice_id,
      issuedInvoiceStatus: document.issued_invoice_status,
      issuedInvoiceError: document.issued_invoice_error,
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

  useEffect(() => {
    if (!production || !overview?.documents.some((document) => document.status === "uploaded" || document.status === "processing")) return;
    const timer = window.setInterval(() => void loadProductionData().catch(() => undefined), 4_000);
    return () => window.clearInterval(timer);
  }, [loadProductionData, overview?.documents, production]);

  const duePayments = payments.filter((payment) => payment.status !== "paid");
  const nextPayment = duePayments[0];
  const platformOperator = isPlatformStaff(session?.platformRole);
  const canAccessOffice = platformOperator || ["owner", "admin", "accountant"].includes(session?.membershipRole || "");
  const actionDocumentsList = documents.filter((document) => document.statusCode ? document.statusCode !== "verified" : document.status !== "Przetworzone");
  const newDuePayments = duePayments.filter((payment) => !seenNotificationIds.payments.includes(String(payment.id)));
  const newActionDocuments = actionDocumentsList.filter((document) => !seenNotificationIds.documents.includes(String(document.id)));

  function markNotificationsSeen() {
    const next = { payments: duePayments.map((payment) => String(payment.id)), documents: actionDocumentsList.map((document) => String(document.id)) };
    setSeenNotificationIds(next);
    if (typeof window !== "undefined") window.localStorage.setItem("epito-notifications-seen", JSON.stringify(next));
  }

  function openNotification(target: Section) {
    markNotificationsSeen();
    setNotificationsOpen(false);
    selectSection(target);
  }

  const navigation: { label: Section; icon: LucideIcon; badge?: string }[] = [
    { label: "Pulpit", icon: LayoutDashboard },
    { label: "Płatności", icon: CreditCard, badge: String(duePayments.length) },
    { label: "Dokumenty", icon: FileText, badge: String(documents.filter((document) => document.statusCode ? document.statusCode !== "verified" : document.status !== "Przetworzone").length) },
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

  async function markPaymentPaid() {
    if (!modalPayment) return;
    setPaying(true);
    try {
      const response = await fetch(`/api/workspace/payments/${modalPayment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się oznaczyć płatności jako opłaconej.");
      await loadProductionData();
      setPaymentSuccess(true);
    } catch (reason) {
      setPortalNotice(reason instanceof Error ? reason.message : "Nie udało się oznaczyć płatności jako opłaconej.");
    } finally {
      setPaying(false);
    }
  }

  async function copyPaymentReference(reference: string) {
    try {
      await navigator.clipboard.writeText(reference);
      setPortalNotice("Numer referencyjny skopiowany do schowka.");
    } catch {
      setPortalNotice(reference);
    }
  }

  async function matchTransactionManually(transactionId: string) {
    const paymentId = matchDrafts[transactionId];
    if (!paymentId) return;
    setMatchingId(transactionId);
    try {
      const response = await fetch(`/api/workspace/payments/${paymentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid", matchTransactionId: transactionId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się dopasować transakcji.");
      await loadProductionData();
      setPortalNotice("Transakcja została dopasowana do płatności.");
    } catch (reason) {
      setPortalNotice(reason instanceof Error ? reason.message : "Nie udało się dopasować transakcji.");
    } finally {
      setMatchingId(null);
    }
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
        setPortalNotice("Dokument został zapisany. Trwa odczyt kwoty i danych faktury.");
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
  const headerName = overview?.tenant.settings?.branding?.headerName || companyName;
  const accentColor = overview?.tenant.settings?.branding?.accentColor || "#CAFF65";
  const hasLogo = Boolean(overview?.tenant.settings?.branding?.logoKey);
  const legalName = overview?.tenant.legal_name || "Kowalski Studio sp. z o.o.";
  const userName = session?.fullName || "Marcin Kowalski";
  const firstName = userName.split(/\s+/)[0] || userName;
  const userRole = session?.membershipRole === "owner" ? "Właściciel" : session?.membershipRole === "admin" ? "Administrator" : session?.membershipRole === "accountant" ? "Księgowość" : session?.membershipRole === "viewer" ? "Podgląd" : "Pracownik";
  const actionDocuments = documents.filter((document) => document.statusCode ? document.statusCode !== "verified" : document.status !== "Przetworzone").length;
  const paidTotal = payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const documentTotal = documents.reduce((sum, document) => sum + Number(String(document.amount || "0").replace(/[^\d,-]/g, "").replace(",", ".")), 0);
  const productionTeam = overview?.team.map((member) => ({ id: member.id, name: member.full_name, email: member.email, role: member.role, status: member.status === "active" ? "Aktywny" : "Zaproszony", initials: initials(member.full_name) }));
  const nearestDueDate = overview?.payments.find((payment) => payment.status !== "paid")?.due_date;
  const daysToDeadline = nearestDueDate ? Math.max(0, Math.ceil((new Date(`${nearestDueDate}T00:00:00`).getTime() - currentDate.getTime()) / 86_400_000)) : 0;
  const todayLabel = new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "numeric", month: "long" }).format(currentDate);

  if (loading) return <main className={darkMode ? "portal-shell theme-dark" : "portal-shell"}><div className="portal-state"><span className="brand-mark">E</span><h1>Ładowanie panelu</h1><p>Pobieramy aktualne dane Twojej organizacji.</p></div></main>;
  if (production && !overview) return <main className={darkMode ? "portal-shell theme-dark" : "portal-shell"}><div className="portal-state"><span className="brand-mark">E</span><h1>Nie udało się otworzyć panelu</h1><p>{loadError || "Spróbuj zalogować się ponownie."}</p><Link className="button button-primary" href="/logowanie">Przejdź do logowania</Link></div></main>;

  return (
    <main className={darkMode ? "portal-shell theme-dark" : "portal-shell"} style={{ "--mint": accentColor } as CSSProperties}>
      <aside className={mobileMenu ? "portal-sidebar sidebar-open" : "portal-sidebar"}>
        <div className="portal-brand">
          {production && hasLogo ? <img className="portal-brand-logo" src="/api/workspace/settings/logo" alt={`Logo ${headerName}`} /> : <span className="brand-mark">E</span>}
          <span><strong>{production ? headerName : "EPITO"}</strong><small>Panel klienta</small></span>
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
          <p>{production ? "Odpowiedzi na najczęstsze pytania o Epito." : "Twój opiekun odpowie na pytania dotyczące rozliczeń."}</p>
          {production ? <a href={marketingFaqUrl()} target="_blank" rel="noreferrer">Zobacz FAQ</a> : <button onClick={() => selectSection("Wiadomości")}>Napisz wiadomość</button>}
        </div>
        {production ? <button className="back-to-site" type="button" onClick={logout}><ArrowLeft size={16} /> Wyloguj się</button> : <Link className="back-to-site" href="/"><ArrowLeft size={16} /> Strona Epito</Link>}
      </aside>

      {mobileMenu && <button className="sidebar-backdrop" aria-label="Zamknij menu" onClick={() => setMobileMenu(false)} />}

      <section className="portal-main">
        {production && platformOperator ? <div className="operator-access-banner"><span><ShieldCheck size={18} /><strong>Dostęp techniczny</strong><small>{platformRoleLabels[session!.platformRole]} przegląda organizację {companyName}. Wejście jest zapisane w dzienniku audytowym.</small></span><button type="button" onClick={() => router.push("/admin")}><ArrowLeft size={17} /> Wróć do panelu platformy</button></div> : null}
        <header className="portal-topbar">
          <button className="mobile-sidebar-button" onClick={() => setMobileMenu(true)} aria-label="Otwórz menu"><Menu size={24} /></button>
          <div className="company-switcher" aria-label="Aktywna firma">
            <span><Building2 size={20} /></span>
            <div><small>Aktywna firma</small><strong>{companyName}</strong></div>
          </div>

          <div className="portal-user-actions">
            <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={darkMode ? "Włącz tryb jasny" : "Włącz tryb ciemny"}>
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
              <span>{darkMode ? "Tryb jasny" : "Tryb ciemny"}</span>
            </button>

            <div className="notification-wrap">
              <button
                className="notification-button"
                onClick={() => setNotificationsOpen((value) => !value)}
                aria-label="Powiadomienia"
              >
                <Bell size={21} />
                {(production ? newDuePayments.length + newActionDocuments.length : 2) > 0 ? <span>{production ? newDuePayments.length + newActionDocuments.length : 2}</span> : null}
              </button>
              <AnimatePresence>
                {notificationsOpen && (
                  <motion.div className="notification-popover" initial={{ opacity: 0, y: 8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.98 }} transition={{ duration: 0.18 }}>
                    <div><strong>Powiadomienia</strong><button onClick={() => setNotificationsOpen(false)} aria-label="Zamknij"><X size={20} /></button></div>
                    {production && duePayments.length + actionDocuments === 0 ? (
                      <div className="notification-empty"><Check size={19} /><span><b>Wszystko sprawdzone</b><small>Nie masz nowych powiadomień.</small></span></div>
                    ) : production ? (
                      <>
                        {duePayments.length ? <button className="notification-item" type="button" onClick={() => openNotification("Płatności")}><span className="notification-icon success"><Check size={15} /></span><span><b>{duePayments.length} płatności oczekuje</b><small>Zobacz płatności</small></span><ArrowRight size={16} /></button> : null}
                        {actionDocuments ? <button className="notification-item" type="button" onClick={() => openNotification("Dokumenty")}><span className="notification-icon warning"><FileText size={15} /></span><span><b>{actionDocuments} dokumentów wymaga uwagi</b><small>Zobacz dokumenty</small></span><ArrowRight size={16} /></button> : null}
                      </>
                    ) : (
                      <>
                        <button className="notification-item" type="button" onClick={() => openNotification("Płatności")}><span className="notification-icon success"><Check size={15} /></span><span><b>Wyliczenie VAT jest gotowe</b><small>Dzisiaj, 08:42</small></span><ArrowRight size={16} /></button>
                        <button className="notification-item" type="button" onClick={() => openNotification("Dokumenty")}><span className="notification-icon warning"><FileText size={15} /></span><span><b>Brakuje umowy leasingu</b><small>Wczoraj, 14:10</small></span><ArrowRight size={16} /></button>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="profile-wrap">
              <button className="user-profile" type="button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen}>
                <span>{initials(userName)}</span>
                <div><strong>{userName}</strong><small>{userRole}</small></div>
                <ChevronDown size={18} />
              </button>
              <AnimatePresence>
                {profileOpen ? <motion.div className="profile-popover" initial={{ opacity: 0, y: 8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: .98 }}><div><strong>{userName}</strong><small>{session?.email || "konto demonstracyjne"}</small></div><button onClick={() => { setProfileOpen(false); selectSection("Ustawienia"); }}><Settings size={17} /> Ustawienia konta</button>{production && canAccessOffice ? <button onClick={() => { setProfileOpen(false); router.push(platformOperator ? "/admin" : "/office"); }}><Building2 size={17} /> {platformOperator ? "Panel platformy" : "Zaplecze biura"}</button> : null}{production ? <button onClick={logout}><ArrowLeft size={17} /> Wyloguj się</button> : <Link href="/"><ArrowLeft size={17} /> Strona główna</Link>}</motion.div> : null}
              </AnimatePresence>
            </div>
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
                    <div className="page-heading-actions">
                      {production ? (
                        <button className="upload-button" type="button" onClick={() => setShowImportModal(true)}><Upload size={18} /> Dodaj dokument</button>
                      ) : (
                        <label className="upload-button"><Upload size={18} /> Dodaj dokument<input type="file" onChange={uploadDocument} /></label>
                      )}
                      {production ? <button className="button button-primary" type="button" onClick={() => setShowIssueInvoiceModal(true)}><FileText size={18} /> Wystaw fakturę</button> : null}
                    </div>
                  </div>

                  <section className="payment-hero-card">
                    <div className="payment-hero-info">
                      <div className="due-icon"><Landmark size={29} /></div>
                      <div><span>NAJBLIŻSZA PŁATNOŚĆ</span><h2>{nextPayment ? `${nextPayment.type} za ${nextPayment.period}` : "Wszystko opłacone"}</h2><p>{nextPayment ? <>Termin płatności <strong>{nextPayment.due}</strong></> : "Nie masz zaległych zobowiązań."}</p></div>
                    </div>
                    {nextPayment ? (
                      <>
                        <div className="payment-hero-amount"><span>DO ZAPŁATY</span><strong>{formatMoney(nextPayment.amount)}</strong></div>
                        <button className="button button-primary pay-button" onClick={() => openPayment(nextPayment)}>{production ? "Szczegóły" : "Zapłać teraz"} <ArrowRight size={19} /></button>
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
                            {payment.status === "paid" ? <span className="paid-pill"><Check size={13} /> Opłacone</span> : <button className="small-pay" onClick={() => openPayment(payment)}>{production ? "Szczegóły" : "Zapłać"}</button>}
                          </div>
                        ))}
                        {payments.length === 0 ? <div className="portal-empty-row">Nie ma jeszcze żadnych płatności.</div> : null}
                      </div>
                    </article>

                    <article className="panel-card">
                      <div className="panel-card-heading"><div><h3>Ostatnie dokumenty</h3><p>Najnowsza aktywność.</p></div><button onClick={() => selectSection("Dokumenty")}>Wszystkie <ArrowRight size={16} /></button></div>
                      <div className="document-mini-list">
                        {documents.slice(0, 3).map((document) => (
                            <div key={document.id}><span>{document.type}</span><div><strong>{document.name}</strong><small>{document.meta}</small></div><b className={document.status === "Przetworzone" || document.status === "Odczytano" ? "done" : "pending"}>{document.status}</b></div>
                        ))}
                        {documents.length === 0 ? <div className="portal-empty-row">Nie ma jeszcze żadnych dokumentów.</div> : null}
                      </div>
                    </article>
                  </section>

                  <section className="advisor-banner">
                    <div className="advisor-avatar">{production ? initials(companyName) : "AK"}</div>
                    <div><small>{production ? "TWOJA ORGANIZACJA" : "TWÓJ OPIEKUN"}</small><h3>{production ? companyName : "Anna Kowalska"} <span className="availability">Aktywna</span></h3><p>{production ? legalName : "Poniedziałek do piątku, od 8:00 do 16:00."}</p></div>
                    <button onClick={() => production ? (canAccessOffice ? router.push(platformOperator ? "/admin" : "/office") : selectSection("Ustawienia")) : selectSection("Wiadomości")}><MessageSquareText size={17} /> {production ? (canAccessOffice ? "Zarządzaj danymi" : "Ustawienia organizacji") : "Napisz wiadomość"}</button>
                    <div className="advisor-phone"><small>{production ? "NIP" : "TELEFON"}</small><strong>{production ? null : <Phone size={14} />} {production ? overview?.tenant.nip || "Nie podano" : "+48 22 123 45 67"}</strong></div>
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
                          {payment.status !== "paid" && <button className="small-pay" onClick={() => openPayment(payment)}>{production ? "Szczegóły" : "Zapłać"} <ArrowRight size={14} /></button>}
                        </div>
                      ))}
                      {payments.length === 0 ? <div className="portal-empty-row">Nie ma jeszcze płatności do wyświetlenia.</div> : null}
                    </div>
                  </div>

                  {production && canAccessOffice && overview?.bankTransactions?.length ? (
                    <div className="panel-card payments-table-card">
                      <div className="panel-card-heading"><div><h3>Nierozpoznane transakcje</h3><p>Wpłaty z zaimportowanego wyciągu bankowego, których nie udało się dopasować automatycznie.</p></div></div>
                      <div className="full-payment-list unmatched-transactions">
                        {overview.bankTransactions.map((transaction) => {
                          const candidates = overview.payments.filter((payment) => payment.status === "due" && payment.payment_source === "issued_invoice" && payment.company_name === transaction.company_name);
                          return (
                            <div key={transaction.id}>
                              <span className={`payment-type ${transaction.match_status}`}>{transaction.match_status === "ambiguous" ? "Niezgodna kwota" : "Nierozpoznana"}</span>
                              <div><strong>{transaction.company_name}</strong><small title={transaction.description}>{transaction.description.slice(0, 70)}{transaction.description.length > 70 ? "…" : ""}</small></div>
                              <strong>{formatMoney(Number(transaction.amount))}</strong>
                              <select value={matchDrafts[transaction.id] || ""} onChange={(event) => setMatchDrafts((current) => ({ ...current, [transaction.id]: event.target.value }))}>
                                <option value="" disabled>Dopasuj do faktury</option>
                                {candidates.map((payment) => <option key={payment.id} value={payment.id}>{payment.period_label} · {formatMoney(Number(payment.amount))}</option>)}
                              </select>
                              <button className="small-pay" disabled={!matchDrafts[transaction.id] || matchingId === transaction.id} onClick={() => void matchTransactionManually(transaction.id)}>{matchingId === transaction.id ? "Zapisywanie" : "Dopasuj"}</button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {section === "Dokumenty" && <DocumentsWorkspace documents={documents} setDocuments={setDocuments} onUpload={uploadDocument} onOpenImport={() => setShowImportModal(true)} onOpenIssueInvoice={() => setShowIssueInvoiceModal(true)} production={production} onChanged={loadProductionData} onNotice={setPortalNotice} />}

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

              {section === "Ustawienia" && <SettingsWorkspace production={production} organization={overview ? { displayName: overview.tenant.display_name, legalName: overview.tenant.legal_name, nip: overview.tenant.nip, slug: overview.tenant.slug, settings: overview.tenant.settings } : undefined} onChanged={loadProductionData} />}
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
                <div className="payment-success"><span><Check size={30} /></span><h2>Płatność przyjęta</h2><p>{production ? "Status płatności został zaktualizowany na opłacony." : "Status został zaktualizowany. To demonstracja, więc żadne środki nie zostały pobrane."}</p><button className="button button-dark button-wide" onClick={closeModal}>Wróć do panelu</button></div>
              ) : (
                <>
                  <span className="modal-kicker">{production ? "SZCZEGÓŁY PŁATNOŚCI" : "PŁATNOŚĆ DEMONSTRACYJNA"}</span>
                  <h2>{modalPayment.type}, {modalPayment.period}</h2>
                  <div className="modal-amount"><small>Kwota do zapłaty</small><strong>{formatMoney(modalPayment.amount)}</strong><span>Termin {modalPayment.due}</span></div>
                  {production && modalPayment.reference ? (
                    <div className="payment-reference-block">
                      <div><small>Numer referencyjny płatności</small><strong>{modalPayment.reference}</strong></div>
                      <button type="button" className="copy-reference" onClick={() => void copyPaymentReference(modalPayment.reference!)}>Kopiuj</button>
                    </div>
                  ) : null}
                  {!production ? <fieldset>
                    <legend>Wybierz metodę</legend>
                    <label className={paymentMethod === "blik" ? "selected" : ""}><input type="radio" name="method" value="blik" checked={paymentMethod === "blik"} onChange={() => setPaymentMethod("blik")} /><b>BLIK</b><span>Kod 6-cyfrowy</span></label>
                    <label className={paymentMethod === "transfer" ? "selected" : ""}><input type="radio" name="method" value="transfer" checked={paymentMethod === "transfer"} onChange={() => setPaymentMethod("transfer")} /><b><Landmark size={18} /></b><span>Szybki przelew</span></label>
                  </fieldset> : null}
                  {!production && paymentMethod === "blik" && <label className="blik-field">Kod BLIK<input inputMode="numeric" maxLength={6} placeholder="Wpisz 6 cyfr" /></label>}
                  <div className="demo-notice"><CircleHelp size={17} /> {production ? "Płatności online zostaną uruchomione po podłączeniu operatora płatności. System nie oznaczy zobowiązania jako opłacone bez potwierdzenia." : "To jest interaktywny prototyp. Kliknięcie nie uruchamia prawdziwej płatności."}</div>
                  {production ? (
                    canAccessOffice ? (
                      <button className="button button-primary button-wide modal-pay" onClick={() => void markPaymentPaid()} disabled={paying}>{paying ? "Zapisywanie" : "Oznacz jako zapłacone"} <ArrowRight size={18} /></button>
                    ) : (
                      <button className="button button-dark button-wide" onClick={closeModal}>Zamknij</button>
                    )
                  ) : (
                    <button className="button button-primary button-wide modal-pay" onClick={confirmPayment} disabled={paying}>{paying ? "Przetwarzanie" : `Potwierdź ${formatMoney(modalPayment.amount)}`} <ArrowRight size={18} /></button>
                  )}
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showImportModal ? (
        <DocumentImportModal
          companies={overview?.companies || []}
          onClose={() => setShowImportModal(false)}
          onImported={async (message) => {
            setPortalNotice(message);
            await loadProductionData();
          }}
        />
      ) : null}

      {showIssueInvoiceModal ? (
        <IssueInvoiceModal
          companies={overview?.companies || []}
          onClose={() => setShowIssueInvoiceModal(false)}
          onIssued={async (message) => {
            setPortalNotice(message);
            await loadProductionData();
          }}
        />
      ) : null}
    </main>
  );
}
