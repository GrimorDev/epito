"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Ban,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Trash2,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import styles from "../secure.module.css";
import { ClientPortal } from "../panel/page";
import { IssueInvoiceModal, issuedInvoiceStatusLabels } from "../panel/workspace-sections";

type Session = {
  fullName: string;
  email: string;
  platformRole: "none" | "support" | "supervisor";
  tenantName: string | null;
  membershipRole: "owner" | "admin" | "accountant" | "employee" | "viewer" | null;
};

type Overview = {
  tenant: { id: string; slug: string; display_name: string; legal_name: string; nip: string | null };
  companies: Array<{ id: string; name: string; nip: string | null; email: string | null; phone: string | null; status: string; created_at: string; documents_count: number; payments_count: number }>;
  team: Array<{ id: string; email: string; full_name: string; role: string; status: string }>;
  documents: Array<{ id: string; name: string; category: string; status: string; document_year: number; document_month: number; amount: string | null; currency: string; company_name: string; created_at: string; issued_invoice_id: string | null; issued_invoice_number: string | null; issued_invoice_status: string | null; issued_invoice_error: string | null; issued_invoice_created_at: string | null; issued_invoice_updated_at: string | null; issued_invoice_environment: string | null; issued_invoice_reference: string | null; ksef_number: string | null; structured_data: { vat_whitelist?: { status: string; message: string | null } } }>;
  payments: Array<{ id: string; tax_type: string; period_label: string; amount: string; currency: string; due_date: string; status: string; company_name: string; recipient_name: string | null; bank_account_number: string | null; transfer_title: string | null; created_at: string }>;
  stats: { clients_count: number; documents_count: number; payments_due_count: number; payments_due_total: string };
  ksefConnections: Array<{ id: string; client_company_id: string; client_company_name: string; environment: string; nip: string; status: string; last_synced_at: string | null; last_error: string | null; created_at: string }>;
};

type Tab = "overview" | "clients" | "team" | "documents" | "payments" | "integrations" | "settings";

const roleLabel: Record<string, string> = {
  owner: "Właściciel",
  admin: "Administrator",
  accountant: "Księgowy",
  employee: "Pracownik",
  viewer: "Podgląd",
};

const tabLabel: Record<Tab, string> = {
  overview: "Pulpit organizacji",
  clients: "Klienci biura",
  team: "Zespół",
  documents: "Dokumenty",
  payments: "Płatności",
  integrations: "Integracje",
  settings: "Ustawienia organizacji",
};

const ksefEnvironmentLabel: Record<string, string> = {
  test: "Testowe",
  demo: "Demo",
  production: "Produkcyjne",
};

const ksefStatusLabel: Record<string, string> = {
  disconnected: "Niepodłączone",
  connected: "Połączone",
  error: "Błąd",
};

const paymentTypeLabel: Record<string, string> = {
  vat: "VAT",
  pit: "PIT",
  cit: "CIT",
  zus: "ZUS",
  invoice: "Faktura",
  other: "Inna płatność",
};

const documentCategoryLabel: Record<string, string> = {
  sales: "Sprzedaż",
  costs: "Koszty",
  bank: "Bank",
  contracts: "Umowy",
  tax: "Podatki",
  other: "Inne",
};

const documentStatusLabel: Record<string, string> = {
  uploaded: "W kolejce",
  processing: "Analiza trwa",
  verified: "Odczytano",
  requires_action: "Sprawdź dane",
  archived: "Archiwalny",
};

const paymentStatusLabel: Record<string, string> = {
  draft: "Szkic",
  due: "Do zapłaty",
  scheduled: "Zaplanowana",
  processing: "Przetwarzana",
  paid: "Opłacona",
  failed: "Błąd płatności",
  cancelled: "Anulowana",
};

const whitelistStatusLabel: Record<string, string> = {
  confirmed: "Rachunek na Białej Liście VAT",
  mismatch: "Rachunek NIE na Białej Liście VAT",
  invalid_input: "Nie udało się sprawdzić",
  check_failed: "Nie udało się sprawdzić",
};

const accountStatusLabel: Record<string, string> = {
  active: "Aktywny",
  invited: "Zaproszony",
  disabled: "Zablokowany",
  suspended: "Zawieszony",
  archived: "Archiwalny",
};

export default function WorkspacePage() {
  return <ClientPortal mode="production" />;
}

export function OfficeWorkspacePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [clientPending, setClientPending] = useState(false);
  const [teamPending, setTeamPending] = useState(false);
  const [paymentPending, setPaymentPending] = useState(false);
  const [settingsPending, setSettingsPending] = useState(false);
  const [clientMessage, setClientMessage] = useState("");
  const [teamMessage, setTeamMessage] = useState("");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [connectionPending, setConnectionPending] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [jpkFaPending, setJpkFaPending] = useState(false);
  const [jpkFaMessage, setJpkFaMessage] = useState("");
  const [showIssueInvoiceModal, setShowIssueInvoiceModal] = useState(false);
  const [issueInvoiceMessage, setIssueInvoiceMessage] = useState("");
  const [syncingConnectionId, setSyncingConnectionId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  const loadOverview = useCallback(async () => {
    const response = await fetch("/api/workspace/overview", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/logowanie");
      return;
    }
    const payload = (await response.json()) as Overview & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Nie udało się pobrać danych.");
    setData(payload);
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.localStorage.getItem("epito-theme") === "dark") setTheme("dark");
      Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error("Brak sesji");
          const payload = (await response.json()) as { session: Session };
          setSession(payload.session);
        }),
        loadOverview(),
      ])
        .catch(() => router.replace("/logowanie"))
        .finally(() => setLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadOverview, router]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("epito-theme", next);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/logowanie");
  }

  async function submitForm(
    event: FormEvent<HTMLFormElement>,
    endpoint: string,
    setPending: (value: boolean) => void,
    setMessage: (value: string) => void,
    successMessage: string,
  ) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zapisać danych.");
      formElement.reset();
      setMessage(successMessage);
      await loadOverview();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Nie udało się zapisać danych.");
    } finally {
      setPending(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsPending(true);
    setSettingsMessage("");
    try {
      const response = await fetch("/api/workspace/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zapisać ustawień.");
      setSettingsMessage("Ustawienia zostały zapisane.");
      await loadOverview();
    } catch (reason) {
      setSettingsMessage(reason instanceof Error ? reason.message : "Nie udało się zapisać ustawień.");
    } finally {
      setSettingsPending(false);
    }
  }

  async function importJpkFa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setJpkFaPending(true);
    setJpkFaMessage("");
    try {
      const response = await fetch("/api/workspace/documents/jpk-fa", {
        method: "POST",
        body: new FormData(formElement),
      });
      const payload = (await response.json()) as { error?: string; imported?: number; skipped?: number };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zaimportować pliku JPK_FA.");
      formElement.reset();
      setJpkFaMessage(`Faktury zostały zaimportowane: ${payload.imported ?? 0}${payload.skipped ? ` (pominięto ${payload.skipped} już istniejących)` : ""}.`);
      await loadOverview();
    } catch (reason) {
      setJpkFaMessage(reason instanceof Error ? reason.message : "Nie udało się zaimportować pliku JPK_FA.");
    } finally {
      setJpkFaPending(false);
    }
  }

  async function triggerKsefSync(connectionId: string) {
    setSyncingConnectionId(connectionId);
    setSyncMessage("");
    try {
      const response = await fetch("/api/workspace/ksef/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się uruchomić synchronizacji.");
      setSyncMessage("Synchronizacja została zlecona. Status pojawi się po jej zakończeniu.");
      await loadOverview();
    } catch (reason) {
      setSyncMessage(reason instanceof Error ? reason.message : "Nie udało się uruchomić synchronizacji.");
    } finally {
      setSyncingConnectionId(null);
    }
  }

  const canCreateClients = session?.platformRole === "supervisor" || ["owner", "admin", "accountant"].includes(session?.membershipRole || "");
  const canManageTeam = session?.platformRole === "supervisor" || ["owner", "admin"].includes(session?.membershipRole || "");
  const canManageSettings = session?.platformRole === "supervisor" || ["owner", "admin"].includes(session?.membershipRole || "");
  const canManageIntegrations = session?.platformRole === "supervisor" || ["owner", "admin"].includes(session?.membershipRole || "");

  const navigation: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
    { id: "overview", label: "Pulpit", icon: LayoutDashboard },
    { id: "clients", label: `Klienci (${data?.companies.length ?? 0})`, icon: Building2 },
    { id: "team", label: `Zespół (${data?.team.length ?? 0})`, icon: Users },
    { id: "documents", label: `Dokumenty (${data?.documents.length ?? 0})`, icon: FileText },
    { id: "payments", label: `Płatności (${data?.payments.length ?? 0})`, icon: WalletCards },
    { id: "integrations", label: `Integracje (${data?.ksefConnections.length ?? 0})`, icon: Plug },
    { id: "settings", label: "Ustawienia", icon: Settings },
  ];

  return (
    <div className={styles.shell} data-theme={theme}>
      <div className={styles.mobileHeader}>
        <span className={styles.brand}><span className={styles.brandMark}>E</span><span>EPITO</span></span>
        <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={toggleTheme} aria-label="Zmień motyw">{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}</button>
      </div>
      <div className={styles.appGrid}>
        <aside className={styles.sidebar}>
          <Link className={styles.brand} href="/office"><span className={styles.brandMark}>E</span><span>EPITO</span></Link>
          <nav>
            <p className={styles.navLabel}>Organizacja</p>
            <div className={styles.navList}>
              {navigation.map((item) => {
                const Icon = item.icon;
                return <button key={item.id} className={tab === item.id ? styles.navItemActive : styles.navItem} type="button" onClick={() => setTab(item.id)}><Icon size={21} /> {item.label}</button>;
              })}
            </div>
          </nav>
          <div className={styles.sidebarBottom}>
            <Link className={styles.navItem} href="/workspace"><ArrowLeft size={21} /> Powrót do panelu klienta</Link>
            {session?.platformRole === "supervisor" ? <Link className={styles.navItem} href="/admin"><ArrowLeft size={21} /> Panel administracyjny</Link> : null}
            <button className={styles.navItem} type="button" onClick={logout}><LogOut size={21} /> Wyloguj się</button>
          </div>
        </aside>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <div className={styles.topbarTitle}><strong>{data?.tenant.display_name || session?.tenantName || "Organizacja"}</strong><span>{session?.fullName} · {session?.membershipRole ? roleLabel[session.membershipRole] : "Supervisor"}</span></div>
            <div className={styles.topbarActions}>
              {session?.platformRole === "supervisor" ? <Link className={styles.buttonGhost} href="/admin"><ArrowLeft size={17} /> Organizacje</Link> : null}
              <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={toggleTheme} aria-label="Zmień motyw">{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}</button>
            </div>
          </header>

          {loading || !data ? <div className={styles.loading}>Ładowanie danych organizacji…</div> : (
            <div className={styles.content}>
              <div className={styles.headingRow}>
                <div><h1>{tabLabel[tab]}</h1><p>{data.tenant.legal_name}{data.tenant.nip ? ` · NIP ${data.tenant.nip}` : ""}</p></div>
                {tab === "clients" && canCreateClients ? <button className={styles.buttonPrimary} type="button" onClick={() => document.getElementById("new-client")?.scrollIntoView({ behavior: "smooth" })}><Plus size={18} /> Dodaj klienta</button> : null}
              </div>

              {tab === "overview" ? (
                <>
                  <section className={styles.statsGrid}>
                    <article className={styles.statCard}><span className={styles.statIcon}><Building2 size={21} /></span><strong>{data.stats.clients_count}</strong><span>aktywnych klientów</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><FileText size={21} /></span><strong>{data.stats.documents_count}</strong><span>dokumentów</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><WalletCards size={21} /></span><strong>{data.stats.payments_due_count}</strong><span>płatności do obsługi</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><WalletCards size={21} /></span><strong>{formatMoney(data.stats.payments_due_total, "PLN")}</strong><span>pozostało do zapłaty</span></article>
                  </section>
                  <section className={styles.panel}>
                    <header className={styles.panelHeader}><div><h2>Ostatnio dodani klienci</h2><p>Dane pobierane bezpośrednio z PostgreSQL.</p></div><button className={styles.buttonGhost} type="button" onClick={() => setTab("clients")}>Pokaż wszystkich</button></header>
                    <CompaniesTable companies={data.companies.slice(0, 5)} />
                  </section>
                </>
              ) : null}

              {tab === "clients" ? (
                <div className={styles.twoColumns}>
                  <section className={styles.panel}>
                    <header className={styles.panelHeader}><div><h2>Firmy obsługiwane przez biuro</h2><p>Każdy rekord jest izolowany identyfikatorem organizacji.</p></div></header>
                    <CompaniesTable companies={data.companies} editable={canCreateClients} onChanged={loadOverview} />
                  </section>
                  {canCreateClients ? (
                    <section className={`${styles.panel} ${styles.formPanel}`} id="new-client">
                      <h2>Nowy klient</h2><p>Dodaj prawdziwą firmę do bieżącej organizacji.</p>
                      <form className={styles.singleForm} onSubmit={(event) => submitForm(event, "/api/workspace/clients", setClientPending, setClientMessage, "Klient został dodany.")}>
                        <div className={styles.field}><label htmlFor="clientName">Nazwa firmy</label><input id="clientName" name="name" required maxLength={180} /></div>
                        <div className={styles.field}><label htmlFor="clientNip">NIP</label><input id="clientNip" name="nip" inputMode="numeric" maxLength={10} /></div>
                        <div className={styles.field}><label htmlFor="clientEmail">E-mail</label><input id="clientEmail" name="email" type="email" maxLength={254} /></div>
                        <div className={styles.field}><label htmlFor="clientPhone">Telefon</label><input id="clientPhone" name="phone" type="tel" maxLength={40} /></div>
                        <FormMessage message={clientMessage} />
                        <button className={styles.buttonPrimary} type="submit" disabled={clientPending}>{clientPending ? "Dodaję klienta…" : "Dodaj klienta"}</button>
                      </form>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {tab === "team" ? (
                <div className={styles.twoColumns}>
                  <section className={styles.panel}>
                    <header className={styles.panelHeader}><div><h2>Użytkownicy organizacji</h2><p>Role decydują o zakresie dostępu do danych i operacji.</p></div></header>
                    {data.team.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Użytkownik</th><th>Rola</th><th>Status</th></tr></thead><tbody>{data.team.map((member) => <tr key={member.id}><td><strong>{member.full_name}</strong><small>{member.email}</small></td><td>{roleLabel[member.role] || "Inna rola"}</td><td><span className={styles.status}>{accountStatusLabel[member.status] || "Nieznany"}</span></td></tr>)}</tbody></table></div> : <Empty title="Brak użytkowników" text="Dodaj pierwszą osobę do zespołu." />}
                  </section>
                  {canManageTeam ? (
                    <section className={`${styles.panel} ${styles.formPanel}`}>
                      <h2>Nowy pracownik</h2><p>Utwórz konto i przypisz rolę w organizacji.</p>
                      <form className={styles.singleForm} onSubmit={(event) => submitForm(event, "/api/workspace/team", setTeamPending, setTeamMessage, "Konto pracownika zostało utworzone.")}>
                        <div className={styles.field}><label htmlFor="fullName">Imię i nazwisko</label><input id="fullName" name="fullName" required maxLength={120} /></div>
                        <div className={styles.field}><label htmlFor="teamEmail">E-mail</label><input id="teamEmail" name="email" type="email" required maxLength={254} /></div>
                        <div className={styles.field}><label htmlFor="role">Rola</label><select id="role" name="role" defaultValue="employee"><option value="admin">Administrator</option><option value="accountant">Księgowy</option><option value="employee">Pracownik</option><option value="viewer">Tylko podgląd</option></select></div>
                        <div className={styles.field}><label htmlFor="teamPassword">Hasło startowe</label><input id="teamPassword" name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, litera i cyfra.</small></div>
                        <FormMessage message={teamMessage} />
                        <button className={styles.buttonPrimary} type="submit" disabled={teamPending}>{teamPending ? "Tworzę konto…" : "Utwórz konto"}</button>
                      </form>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {tab === "documents" ? (
                <div className={styles.twoColumns}>
                  <section className={styles.panel}>
                    <header className={styles.panelHeader}>
                      <div><h2>Dokumenty klientów</h2><p>Lista dokumentów zapisanych dla bieżącej organizacji.</p></div>
                      {canCreateClients ? <button className={styles.buttonPrimary} type="button" onClick={() => setShowIssueInvoiceModal(true)}><FileText size={18} /> Wystaw fakturę</button> : null}
                    </header>
                    <FormMessage message={issueInvoiceMessage} />
                    {data.documents.length ? <DocumentsTable documents={data.documents} onChanged={loadOverview} /> : <Empty title="Brak dokumentów" text="Dokumenty pojawią się tutaj po imporcie lub synchronizacji z systemem księgowym." />}
                  </section>
                  {canCreateClients ? (
                    <section className={`${styles.panel} ${styles.formPanel}`}>
                      <h2>Zaimportuj JPK_FA</h2><p>Wgraj plik JPK_FA wyeksportowany z Comarch, Insert, Symfonii lub innego programu księgowego klienta — faktury sprzedażowe trafią do Dokumentów.</p>
                      <form className={styles.singleForm} onSubmit={importJpkFa}>
                        <div className={styles.field}><label htmlFor="jpkFaCompany">Klient</label><select id="jpkFaCompany" name="clientCompanyId" required defaultValue=""><option value="" disabled>Wybierz firmę</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
                        <div className={styles.field}><label htmlFor="jpkFaFile">Plik JPK_FA (XML)</label><input id="jpkFaFile" name="file" type="file" accept=".xml,text/xml,application/xml" required /></div>
                        <FormMessage message={jpkFaMessage} />
                        {!data.companies.length ? <div className={styles.error}>Najpierw dodaj klienta biura.</div> : null}
                        <button className={styles.buttonPrimary} type="submit" disabled={jpkFaPending || !data.companies.length}>{jpkFaPending ? "Importuję…" : "Zaimportuj"}</button>
                      </form>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {tab === "payments" ? (
                <div className={styles.twoColumns}>
                  <section className={styles.panel}>
                    <header className={styles.panelHeader}><div><h2>Rozliczenia i terminy</h2><p>Rzeczywiste zobowiązania klientów zapisane w PostgreSQL.</p></div></header>
                    {data.payments.length ? <PaymentsTable payments={data.payments} /> : <Empty title="Brak płatności" text="Dodaj pierwszą płatność dla klienta, aby rozpocząć pilnowanie terminów." />}
                  </section>
                  {canCreateClients ? (
                    <section className={`${styles.panel} ${styles.formPanel}`}>
                      <h2>Nowa płatność</h2><p>Dodaj kwotę i termin widoczny dla klienta.</p>
                      <form className={styles.singleForm} onSubmit={(event) => submitForm(event, "/api/workspace/payments", setPaymentPending, setPaymentMessage, "Płatność została dodana.")}>
                        <div className={styles.field}><label htmlFor="paymentCompany">Klient</label><select id="paymentCompany" name="clientCompanyId" required defaultValue=""><option value="" disabled>Wybierz firmę</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
                        <div className={styles.field}><label htmlFor="taxType">Rodzaj</label><select id="taxType" name="taxType" defaultValue="vat"><option value="vat">VAT</option><option value="pit">PIT</option><option value="cit">CIT</option><option value="zus">ZUS</option><option value="invoice">Faktura</option><option value="other">Inna płatność</option></select></div>
                        <div className={styles.field}><label htmlFor="periodLabel">Okres</label><input id="periodLabel" name="periodLabel" required maxLength={80} placeholder="np. lipiec 2026" /></div>
                        <div className={styles.field}><label htmlFor="amount">Kwota</label><input id="amount" name="amount" required type="number" min="0.01" step="0.01" inputMode="decimal" /></div>
                        <div className={styles.field}><label htmlFor="dueDate">Termin płatności</label><input id="dueDate" name="dueDate" required type="date" /></div>
                        <div className={styles.field}><label htmlFor="recipientName">Nazwa odbiorcy</label><input id="recipientName" name="recipientName" maxLength={180} placeholder="np. Urząd Skarbowy lub nazwa sprzedawcy" /></div>
                        <div className={styles.field}><label htmlFor="bankAccountNumber">Rachunek do przelewu</label><input id="bankAccountNumber" name="bankAccountNumber" inputMode="numeric" maxLength={34} placeholder="26 cyfr, opcjonalnie" /><small>Klient zobaczy gotowe dane do zwykłego przelewu. Epito nie pośredniczy w przepływie środków.</small></div>
                        <div className={styles.field}><label htmlFor="transferTitle">Tytuł przelewu</label><input id="transferTitle" name="transferTitle" maxLength={140} placeholder="np. VAT 07/2026, NIP 1234567890" /></div>
                        <FormMessage message={paymentMessage} />
                        {!data.companies.length ? <div className={styles.error}>Najpierw dodaj klienta biura.</div> : null}
                        <button className={styles.buttonPrimary} type="submit" disabled={paymentPending || !data.companies.length}>{paymentPending ? "Dodaję płatność…" : "Dodaj płatność"}</button>
                      </form>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {tab === "integrations" ? (
                <div className={styles.twoColumns}>
                  <section className={styles.panel}>
                    <header className={styles.panelHeader}>
                      <div><h2>Połączenia KSeF</h2><p>Automatyczna synchronizacja w tle co ok. 10 minut. Gdy klient czeka na telefonie, użyj &bdquo;Synchronizuj teraz&rdquo; — działa od razu.</p></div>
                      <button className={styles.buttonGhost} type="button" onClick={() => loadOverview()}><RefreshCw size={17} /> Odśwież</button>
                    </header>
                    <FormMessage message={syncMessage} />
                    <ConnectionsTable
                      connections={data.ksefConnections}
                      onSync={triggerKsefSync}
                      syncingConnectionId={syncingConnectionId}
                    />
                  </section>
                  {canManageIntegrations ? (
                    <section className={`${styles.panel} ${styles.formPanel}`}>
                      <h2>Podłącz KSeF</h2><p>Token generuje się w Aplikacji Podatnika KSeF dla NIP-u firmy klienta.</p>
                      <form className={styles.singleForm} onSubmit={(event) => submitForm(event, "/api/workspace/ksef/connections", setConnectionPending, setConnectionMessage, "Połączenie KSeF zostało zapisane.")}>
                        <div className={styles.field}><label htmlFor="ksefClientCompanyId">Klient</label><select id="ksefClientCompanyId" name="clientCompanyId" required defaultValue=""><option value="" disabled>Wybierz firmę</option>{data.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></div>
                        <div className={styles.field}><label htmlFor="ksefEnvironment">Środowisko</label><select id="ksefEnvironment" name="environment" defaultValue="test"><option value="test">Testowe</option><option value="demo">Demo</option><option value="production">Produkcyjne</option></select></div>
                        <div className={styles.field}><label htmlFor="ksefNip">NIP</label><input id="ksefNip" name="nip" required inputMode="numeric" maxLength={10} /></div>
                        <div className={styles.field}><label htmlFor="ksefToken">Token KSeF</label><input id="ksefToken" name="token" type="password" required minLength={10} maxLength={512} autoComplete="off" /></div>
                        <FormMessage message={connectionMessage} />
                        {!data.companies.length ? <div className={styles.error}>Najpierw dodaj klienta biura.</div> : null}
                        <button className={styles.buttonPrimary} type="submit" disabled={connectionPending || !data.companies.length}>{connectionPending ? "Zapisuję…" : "Podłącz KSeF"}</button>
                      </form>
                    </section>
                  ) : null}
                </div>
              ) : null}

              {tab === "settings" ? (
                <div className={styles.twoColumns}>
                  <section className={`${styles.panel} ${styles.formPanel}`}>
                    <h2>Dane organizacji</h2><p>Informacje widoczne w panelu zespołu.</p>
                    {canManageSettings ? (
                      <form key={`${data.tenant.display_name}-${data.tenant.legal_name}-${data.tenant.nip || ""}`} className={styles.singleForm} onSubmit={saveSettings}>
                        <div className={styles.field}><label htmlFor="settingsDisplayName">Nazwa w panelu</label><input id="settingsDisplayName" name="displayName" required maxLength={100} defaultValue={data.tenant.display_name} /></div>
                        <div className={styles.field}><label htmlFor="settingsLegalName">Pełna nazwa firmy</label><input id="settingsLegalName" name="legalName" required maxLength={180} defaultValue={data.tenant.legal_name} /></div>
                        <div className={styles.field}><label htmlFor="settingsNip">NIP</label><input id="settingsNip" name="nip" inputMode="numeric" maxLength={10} defaultValue={data.tenant.nip || ""} /></div>
                        <div className={styles.field}><label>Adres organizacji</label><input value={data.tenant.slug} readOnly aria-readonly="true" /><small>Zmiana adresu wymaga kontaktu z administratorem platformy.</small></div>
                        <FormMessage message={settingsMessage} />
                        <button className={styles.buttonPrimary} type="submit" disabled={settingsPending}>{settingsPending ? "Zapisuję…" : "Zapisz ustawienia"}</button>
                      </form>
                    ) : <div className={styles.readOnlyNotice}>Te ustawienia może zmienić właściciel lub administrator organizacji.</div>}
                  </section>
                  <PasswordForm />
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>
      {data && showIssueInvoiceModal ? (
        <IssueInvoiceModal
          companies={data.companies}
          onClose={() => setShowIssueInvoiceModal(false)}
          onIssued={async (message) => {
            setIssueInvoiceMessage(message);
            await loadOverview();
          }}
        />
      ) : null}
    </div>
  );
}

function CompaniesTable({
  companies,
  editable = false,
  onChanged,
}: {
  companies: Overview["companies"];
  editable?: boolean;
  onChanged?: () => Promise<void> | void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftNip, setDraftNip] = useState("");
  const [draftEmail, setDraftEmail] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (!companies.length) return <Empty title="Brak klientów" text="Dodaj pierwszą firmę, aby rozpocząć pracę na rzeczywistych danych." />;

  function beginEdit(company: Overview["companies"][number]) {
    setEditingId(company.id);
    setDraftName(company.name);
    setDraftNip(company.nip || "");
    setDraftEmail(company.email || "");
    setDraftPhone(company.phone || "");
    setError("");
  }

  async function saveEdit(clientId: string) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/workspace/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: draftName, nip: draftNip, email: draftEmail, phone: draftPhone }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zapisać zmian.");
      setEditingId(null);
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się zapisać zmian.");
    } finally {
      setPending(false);
    }
  }

  async function deleteClient(clientId: string, name: string) {
    if (!window.confirm(`Usunąć klienta „${name}”? Dokumenty i płatności pozostaną w historii.`)) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/workspace/clients/${clientId}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się usunąć klienta.");
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się usunąć klienta.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.tableWrap}>
      {error ? <div className={styles.error}>{error}</div> : null}
      <table className={styles.table}>
        <thead>
          <tr><th>Firma</th><th>Kontakt</th><th>Dokumenty</th><th>Płatności</th><th>Status</th>{editable ? <th /> : null}</tr>
        </thead>
        <tbody>
          {companies.map((company) =>
            editingId === company.id ? (
              <tr key={company.id}>
                <td colSpan={editable ? 6 : 5}>
                  <div className={styles.inlineEditGrid}>
                    <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Nazwa firmy" maxLength={180} />
                    <input value={draftNip} onChange={(event) => setDraftNip(event.target.value)} placeholder="NIP" inputMode="numeric" maxLength={10} />
                    <input value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} placeholder="E-mail" type="email" maxLength={254} />
                    <input value={draftPhone} onChange={(event) => setDraftPhone(event.target.value)} placeholder="Telefon" type="tel" maxLength={40} />
                    <button className={styles.buttonPrimary} type="button" disabled={pending} onClick={() => void saveEdit(company.id)}>{pending ? "Zapisuję…" : "Zapisz"}</button>
                    <button className={styles.iconAction} type="button" disabled={pending} onClick={() => setEditingId(null)} aria-label="Anuluj"><X size={18} /></button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={company.id}>
                <td><strong>{company.name}</strong><small>{company.nip ? `NIP ${company.nip}` : "Bez NIP"}</small></td>
                <td>{company.email || company.phone || "Nie podano"}</td>
                <td>{company.documents_count}</td>
                <td>{company.payments_count}</td>
                <td><span className={styles.status}>{accountStatusLabel[company.status] || "Nieznany"}</span></td>
                {editable ? (
                  <td><div className={styles.rowActions}>
                    <button type="button" onClick={() => beginEdit(company)} aria-label={`Edytuj ${company.name}`} title="Edytuj klienta"><Pencil size={17} /></button>
                    <button className={styles.dangerIcon} type="button" disabled={pending} onClick={() => void deleteClient(company.id, company.name)} aria-label={`Usuń ${company.name}`} title="Usuń klienta"><Trash2 size={17} /></button>
                  </div>
                  </td>
                ) : null}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function DocumentsTable({ documents, onChanged }: { documents: Overview["documents"]; onChanged?: () => Promise<void> | void }) {
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [verifyingWhitelistId, setVerifyingWhitelistId] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Overview["documents"][number] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedDocument) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedDocument(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedDocument]);

  async function retryInvoice(invoiceId: string) {
    setRetryingId(invoiceId);
    setError("");
    try {
      const response = await fetch(`/api/workspace/invoices/${invoiceId}/retry`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się ponowić wysyłki.");
      setSelectedDocument(null);
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się ponowić wysyłki.");
    } finally {
      setRetryingId(null);
    }
  }

  async function cancelInvoice(invoiceId: string) {
    setCancellingId(invoiceId);
    setError("");
    try {
      const response = await fetch(`/api/workspace/invoices/${invoiceId}/cancel`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się anulować obsługi wysyłki.");
      setSelectedDocument(null);
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się anulować obsługi wysyłki.");
    } finally {
      setCancellingId(null);
    }
  }

  async function verifyWhitelist(documentId: string) {
    setVerifyingWhitelistId(documentId);
    setError("");
    try {
      const response = await fetch(`/api/workspace/documents/${documentId}/verify-whitelist`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zlecić sprawdzenia.");
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się zlecić sprawdzenia.");
    } finally {
      setVerifyingWhitelistId(null);
    }
  }

  return (
    <div className={styles.tableWrap}>
      {error ? <div className={styles.error}>{error}</div> : null}
      <table className={styles.table}>
        <thead><tr><th>Dokument</th><th>Klient</th><th>Okres</th><th>Kategoria</th><th>Kwota</th><th>Status</th><th>Status KSeF</th></tr></thead>
        <tbody>
          {documents.map((document) => (
            <tr key={document.id}>
              <td><strong>{document.name}</strong><small>Dodano {new Date(document.created_at).toLocaleDateString("pl-PL")}</small></td>
              <td>{document.company_name}</td>
              <td>{String(document.document_month).padStart(2, "0")}.{document.document_year}</td>
              <td>{documentCategoryLabel[document.category] || "Inne"}</td>
              <td>{document.amount ? formatMoney(document.amount, document.currency) : "—"}</td>
              <td><span className={styles.status}>{documentStatusLabel[document.status] || "Nieznany"}</span></td>
              <td>
                {document.issued_invoice_status ? (
                  <div className={styles.ksefCell}>
                    <span className={`${styles.status} ${document.issued_invoice_status === "accepted" ? styles.ksefAccepted : document.issued_invoice_status === "failed" || document.issued_invoice_status === "rejected" ? styles.ksefError : document.issued_invoice_status === "cancelled" ? styles.ksefCancelled : styles.ksefPending}`}>{issuedInvoiceStatusLabels[document.issued_invoice_status] || "Nieznany status"}</span>
                    <button className={styles.ksefDetailsButton} type="button" onClick={() => setSelectedDocument(document)}>Szczegóły</button>
                  </div>
                ) : document.structured_data?.vat_whitelist ? (
                  <div className={styles.ksefCell}>
                    <span className={`${styles.status} ${document.structured_data.vat_whitelist.status === "confirmed" ? styles.ksefAccepted : document.structured_data.vat_whitelist.status === "mismatch" ? styles.ksefError : styles.ksefPending}`}>{whitelistStatusLabel[document.structured_data.vat_whitelist.status] || "Nieznany status"}</span>
                    {document.structured_data.vat_whitelist.status !== "confirmed" ? (
                      <button className={styles.ksefDetailsButton} type="button" disabled={verifyingWhitelistId === document.id} onClick={() => void verifyWhitelist(document.id)}>{verifyingWhitelistId === document.id ? "Sprawdzam…" : "Sprawdź ponownie"}</button>
                    ) : null}
                  </div>
                ) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedDocument?.issued_invoice_status ? (
        <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="ksef-details-title" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedDocument(null); }}>
          <section className={`${styles.modal} ${styles.ksefDetailsModal}`}>
            <header className={styles.modalHeader}>
              <div><span className={styles.modalEyebrow}>STATUS WYSYŁKI DO KSeF</span><h2 id="ksef-details-title">{selectedDocument.issued_invoice_number || selectedDocument.name}</h2><p>{selectedDocument.company_name}</p></div>
              <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={() => setSelectedDocument(null)} aria-label="Zamknij szczegóły" autoFocus><X size={20} /></button>
            </header>
            <div className={styles.ksefDetailsSummary}>
              <span className={`${styles.status} ${selectedDocument.issued_invoice_status === "accepted" ? styles.ksefAccepted : selectedDocument.issued_invoice_status === "failed" || selectedDocument.issued_invoice_status === "rejected" ? styles.ksefError : selectedDocument.issued_invoice_status === "cancelled" ? styles.ksefCancelled : styles.ksefPending}`}>{issuedInvoiceStatusLabels[selectedDocument.issued_invoice_status] || "Nieznany status"}</span>
              <strong>{selectedDocument.amount ? formatMoney(selectedDocument.amount, selectedDocument.currency) : "Kwota nieustalona"}</strong>
            </div>
            <dl className={styles.ksefDetailsGrid}>
              <div><dt>Dokument</dt><dd>{selectedDocument.name}</dd></div>
              <div><dt>Okres</dt><dd>{String(selectedDocument.document_month).padStart(2, "0")}.{selectedDocument.document_year}</dd></div>
              <div><dt>Środowisko</dt><dd>{selectedDocument.issued_invoice_environment ? ksefEnvironmentLabel[selectedDocument.issued_invoice_environment] || selectedDocument.issued_invoice_environment : "Nie ustalono"}</dd></div>
              <div><dt>Utworzono próbę</dt><dd>{selectedDocument.issued_invoice_created_at ? new Date(selectedDocument.issued_invoice_created_at).toLocaleString("pl-PL") : "Brak danych"}</dd></div>
              <div><dt>Ostatnia aktualizacja</dt><dd>{selectedDocument.issued_invoice_updated_at ? new Date(selectedDocument.issued_invoice_updated_at).toLocaleString("pl-PL") : "Brak danych"}</dd></div>
              {selectedDocument.ksef_number ? <div className={styles.fieldFull}><dt>Numer KSeF</dt><dd>{selectedDocument.ksef_number}</dd></div> : null}
              {selectedDocument.issued_invoice_reference ? <div className={styles.fieldFull}><dt>Identyfikator wysyłki</dt><dd>{selectedDocument.issued_invoice_reference}</dd></div> : null}
            </dl>
            {selectedDocument.issued_invoice_error ? <div className={styles.ksefErrorContext}><strong>Pełny komunikat KSeF</strong><p>{selectedDocument.issued_invoice_error}</p></div> : <div className={styles.ksefInfoContext}><strong>Brak komunikatu błędu</strong><p>Wysyłka nie wymaga obecnie działania użytkownika.</p></div>}
            <div className={styles.ksefSafetyNote}>Anulowanie jest dostępne tylko dla próby zakończonej błędem lub odrzuconej. Faktury przyjętej przez KSeF nie można usunąć; jej zmianę wykonuje się dokumentem korygującym.</div>
            <footer className={styles.ksefModalActions}>
              <button className={styles.buttonGhost} type="button" onClick={() => setSelectedDocument(null)}>Zamknij</button>
              {(selectedDocument.issued_invoice_status === "failed" || selectedDocument.issued_invoice_status === "rejected") && selectedDocument.issued_invoice_id ? <button className={styles.buttonDanger} type="button" disabled={cancellingId === selectedDocument.issued_invoice_id} onClick={() => void cancelInvoice(selectedDocument.issued_invoice_id!)}><Ban size={17} /> {cancellingId === selectedDocument.issued_invoice_id ? "Anuluję…" : "Anuluj próbę"}</button> : null}
              {(["failed", "rejected", "cancelled"].includes(selectedDocument.issued_invoice_status)) && selectedDocument.issued_invoice_id ? <button className={styles.buttonPrimary} type="button" disabled={retryingId === selectedDocument.issued_invoice_id} onClick={() => void retryInvoice(selectedDocument.issued_invoice_id!)}><RefreshCw size={17} /> {retryingId === selectedDocument.issued_invoice_id ? "Wysyłam…" : selectedDocument.issued_invoice_status === "cancelled" ? "Wznów wysyłkę" : "Wyślij ponownie"}</button> : null}
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function PaymentsTable({ payments }: { payments: Overview["payments"] }) {
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Płatność</th><th>Klient</th><th>Okres</th><th>Termin</th><th>Kwota</th><th>Status</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td><strong>{paymentTypeLabel[payment.tax_type] || "Inna płatność"}</strong></td><td>{payment.company_name}</td><td>{payment.period_label}</td><td>{new Date(`${payment.due_date}T00:00:00`).toLocaleDateString("pl-PL")}</td><td><strong>{formatMoney(payment.amount, payment.currency)}</strong></td><td><span className={styles.status}>{paymentStatusLabel[payment.status] || "Nieznany"}</span></td></tr>)}</tbody></table></div>;
}

function ConnectionsTable({
  connections,
  onSync,
  syncingConnectionId,
}: {
  connections: Overview["ksefConnections"];
  onSync: (connectionId: string) => void;
  syncingConnectionId: string | null;
}) {
  if (!connections.length) {
    return <Empty title="Brak połączeń KSeF" text="Podłącz pierwszą firmę klienta, aby zacząć pobierać jej faktury z KSeF." />;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Klient</th><th>NIP</th><th>Środowisko</th><th>Status</th><th>Ostatnia synchronizacja</th><th></th></tr></thead>
        <tbody>
          {connections.map((connection) => (
            <tr key={connection.id}>
              <td><strong>{connection.client_company_name}</strong></td>
              <td>{connection.nip}</td>
              <td>{ksefEnvironmentLabel[connection.environment] || connection.environment}</td>
              <td>
                <span className={styles.status}>{ksefStatusLabel[connection.status] || connection.status}</span>
                {connection.status === "error" && connection.last_error ? <small>{connection.last_error}</small> : null}
              </td>
              <td>{connection.last_synced_at ? new Date(connection.last_synced_at).toLocaleString("pl-PL") : "Nigdy"}</td>
              <td>
                <button
                  className={styles.buttonGhost}
                  type="button"
                  disabled={syncingConnectionId === connection.id}
                  onClick={() => onSync(connection.id)}
                >
                  {syncingConnectionId === connection.id ? "Zlecam…" : "Synchronizuj teraz"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zmienić hasła.");
      formElement.reset();
      setMessage("Hasło zostało zmienione.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Nie udało się zmienić hasła.");
    } finally {
      setPending(false);
    }
  }

  return <section className={`${styles.panel} ${styles.formPanel}`}><h2>Bezpieczeństwo konta</h2><p>Zmień hasło używane do logowania.</p><form className={styles.singleForm} onSubmit={changePassword}><div className={styles.field}><label htmlFor="currentPassword">Obecne hasło</label><input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" /></div><div className={styles.field}><label htmlFor="newPassword">Nowe hasło</label><input id="newPassword" name="newPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, litera i cyfra.</small></div><FormMessage message={message} /><button className={styles.buttonPrimary} type="submit" disabled={pending}>{pending ? "Zmieniam hasło…" : "Zmień hasło"}</button></form></section>;
}

function FormMessage({ message }: { message: string }) {
  if (!message) return null;
  const successful = message.includes("został") || message.includes("zostały") || message.includes("utworzone") || message.includes("zmienione");
  return <div className={successful ? styles.success : styles.error} role="status">{message}</div>;
}

function formatMoney(amount: string, currency: string) {
  return Number(amount).toLocaleString("pl-PL", { style: "currency", currency });
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className={styles.empty}><Building2 size={40} /><h3>{title}</h3><p>{text}</p></div>;
}
