"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sun,
  Users,
  WalletCards,
} from "lucide-react";
import styles from "../secure.module.css";

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
  stats: { clients_count: number; documents_count: number; payments_due_count: number; payments_due_total: string };
};

type Tab = "overview" | "clients" | "team";

const roleLabel: Record<string, string> = {
  owner: "Właściciel",
  admin: "Administrator",
  accountant: "Księgowy",
  employee: "Pracownik",
  viewer: "Podgląd",
};

export default function WorkspacePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [clientPending, setClientPending] = useState(false);
  const [teamPending, setTeamPending] = useState(false);
  const [clientMessage, setClientMessage] = useState("");
  const [teamMessage, setTeamMessage] = useState("");

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

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setClientPending(true);
    setClientMessage("");
    try {
      const response = await fetch("/api/workspace/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się dodać klienta.");
      formElement.reset();
      setClientMessage("Klient został dodany.");
      await loadOverview();
    } catch (reason) {
      setClientMessage(reason instanceof Error ? reason.message : "Nie udało się dodać klienta.");
    } finally {
      setClientPending(false);
    }
  }

  async function createTeamMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setTeamPending(true);
    setTeamMessage("");
    try {
      const response = await fetch("/api/workspace/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się dodać pracownika.");
      formElement.reset();
      setTeamMessage("Konto pracownika zostało utworzone.");
      await loadOverview();
    } catch (reason) {
      setTeamMessage(reason instanceof Error ? reason.message : "Nie udało się dodać pracownika.");
    } finally {
      setTeamPending(false);
    }
  }

  const canCreateClients = session?.platformRole === "supervisor" || ["owner", "admin", "accountant"].includes(session?.membershipRole || "");
  const canManageTeam = session?.platformRole === "supervisor" || ["owner", "admin"].includes(session?.membershipRole || "");

  return (
    <div className={styles.shell} data-theme={theme}>
      <div className={styles.mobileHeader}>
        <span className={styles.brand}><span className={styles.brandMark}>E</span><span>EPITO</span></span>
        <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={toggleTheme} aria-label="Zmień motyw">{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}</button>
      </div>
      <div className={styles.appGrid}>
        <aside className={styles.sidebar}>
          <Link className={styles.brand} href="/workspace"><span className={styles.brandMark}>E</span><span>EPITO</span></Link>
          <nav>
            <p className={styles.navLabel}>Organizacja</p>
            <div className={styles.navList}>
              <button className={tab === "overview" ? styles.navItemActive : styles.navItem} type="button" onClick={() => setTab("overview")}><LayoutDashboard size={21} /> Pulpit</button>
              <button className={tab === "clients" ? styles.navItemActive : styles.navItem} type="button" onClick={() => setTab("clients")}><Building2 size={21} /> Klienci</button>
              <button className={tab === "team" ? styles.navItemActive : styles.navItem} type="button" onClick={() => setTab("team")}><Users size={21} /> Zespół</button>
              <span className={styles.navItem}><FileText size={21} /> Dokumenty</span>
              <span className={styles.navItem}><WalletCards size={21} /> Płatności</span>
              <span className={styles.navItem}><Settings size={21} /> Ustawienia</span>
            </div>
          </nav>
          <div className={styles.sidebarBottom}>
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
                <div><h1>{tab === "overview" ? "Pulpit organizacji" : tab === "clients" ? "Klienci biura" : "Zespół"}</h1><p>{data.tenant.legal_name}{data.tenant.nip ? ` · NIP ${data.tenant.nip}` : ""}</p></div>
                {tab === "clients" && canCreateClients ? <button className={styles.buttonPrimary} type="button" onClick={() => document.getElementById("new-client")?.scrollIntoView({ behavior: "smooth" })}><Plus size={18} /> Dodaj klienta</button> : null}
              </div>

              <div className={styles.tabs}>
                <button className={tab === "overview" ? styles.tabActive : styles.tab} type="button" onClick={() => setTab("overview")}>Przegląd</button>
                <button className={tab === "clients" ? styles.tabActive : styles.tab} type="button" onClick={() => setTab("clients")}>Klienci ({data.companies.length})</button>
                <button className={tab === "team" ? styles.tabActive : styles.tab} type="button" onClick={() => setTab("team")}>Zespół ({data.team.length})</button>
              </div>

              {tab === "overview" ? (
                <>
                  <section className={styles.statsGrid}>
                    <article className={styles.statCard}><span className={styles.statIcon}><Building2 size={21} /></span><strong>{data.stats.clients_count}</strong><span>aktywnych klientów</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><FileText size={21} /></span><strong>{data.stats.documents_count}</strong><span>dokumentów</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><WalletCards size={21} /></span><strong>{data.stats.payments_due_count}</strong><span>płatności do obsługi</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><WalletCards size={21} /></span><strong>{Number(data.stats.payments_due_total).toLocaleString("pl-PL", { style: "currency", currency: "PLN" })}</strong><span>pozostało do zapłaty</span></article>
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
                    <CompaniesTable companies={data.companies} />
                  </section>
                  {canCreateClients ? (
                    <section className={`${styles.panel} ${styles.formPanel}`} id="new-client">
                      <h2>Nowy klient</h2><p>Dodaj prawdziwą firmę do bieżącej organizacji.</p>
                      <form className={styles.singleForm} onSubmit={createClient}>
                        <div className={styles.field}><label htmlFor="clientName">Nazwa firmy</label><input id="clientName" name="name" required maxLength={180} /></div>
                        <div className={styles.field}><label htmlFor="clientNip">NIP</label><input id="clientNip" name="nip" inputMode="numeric" maxLength={10} /></div>
                        <div className={styles.field}><label htmlFor="clientEmail">E-mail</label><input id="clientEmail" name="email" type="email" maxLength={254} /></div>
                        <div className={styles.field}><label htmlFor="clientPhone">Telefon</label><input id="clientPhone" name="phone" type="tel" maxLength={40} /></div>
                        {clientMessage ? <div className={clientMessage.includes("został") ? styles.success : styles.error}>{clientMessage}</div> : null}
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
                    {data.team.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Użytkownik</th><th>Rola</th><th>Status</th></tr></thead><tbody>{data.team.map((member) => <tr key={member.id}><td><strong>{member.full_name}</strong><small>{member.email}</small></td><td>{roleLabel[member.role] || member.role}</td><td><span className={styles.status}>{member.status === "active" ? "Aktywny" : member.status}</span></td></tr>)}</tbody></table></div> : <Empty title="Brak użytkowników" text="Dodaj pierwszą osobę do zespołu." />}
                  </section>
                  {canManageTeam ? (
                    <section className={`${styles.panel} ${styles.formPanel}`}>
                      <h2>Nowy pracownik</h2><p>Utwórz konto i przypisz rolę w organizacji.</p>
                      <form className={styles.singleForm} onSubmit={createTeamMember}>
                        <div className={styles.field}><label htmlFor="fullName">Imię i nazwisko</label><input id="fullName" name="fullName" required maxLength={120} /></div>
                        <div className={styles.field}><label htmlFor="teamEmail">E-mail</label><input id="teamEmail" name="email" type="email" required maxLength={254} /></div>
                        <div className={styles.field}><label htmlFor="role">Rola</label><select id="role" name="role" defaultValue="employee"><option value="admin">Administrator</option><option value="accountant">Księgowy</option><option value="employee">Pracownik</option><option value="viewer">Tylko podgląd</option></select></div>
                        <div className={styles.field}><label htmlFor="teamPassword">Hasło startowe</label><input id="teamPassword" name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, litera i cyfra.</small></div>
                        {teamMessage ? <div className={teamMessage.includes("zostało") ? styles.success : styles.error}>{teamMessage}</div> : null}
                        <button className={styles.buttonPrimary} type="submit" disabled={teamPending}>{teamPending ? "Tworzę konto…" : "Utwórz konto"}</button>
                      </form>
                    </section>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CompaniesTable({ companies }: { companies: Overview["companies"] }) {
  if (!companies.length) return <Empty title="Brak klientów" text="Dodaj pierwszą firmę, aby rozpocząć pracę na rzeczywistych danych." />;
  return <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Firma</th><th>Kontakt</th><th>Dokumenty</th><th>Płatności</th><th>Status</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td><strong>{company.name}</strong><small>{company.nip ? `NIP ${company.nip}` : "Bez NIP"}</small></td><td>{company.email || company.phone || "Nie podano"}</td><td>{company.documents_count}</td><td>{company.payments_count}</td><td><span className={styles.status}>{company.status === "active" ? "Aktywny" : company.status}</span></td></tr>)}</tbody></table></div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className={styles.empty}><Building2 size={40} /><h3>{title}</h3><p>{text}</p></div>;
}
