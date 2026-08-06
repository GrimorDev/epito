"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from "lucide-react";
import styles from "../secure.module.css";

type Session = { fullName: string; email: string; platformRole: string };
type Section = "overview" | "organizations" | "users" | "settings";

type Tenant = {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  nip: string | null;
  status: string;
  createdAt: string;
  clientsCount: number;
  usersCount: number;
  portalHost: string;
};

type PlatformUser = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  platform_role: string;
  tenant_name: string | null;
  membership_role: string | null;
  created_at: string;
};

const sectionTitle: Record<Section, { title: string; description: string }> = {
  overview: { title: "Centrum zarządzania", description: "Najważniejsze dane całej platformy w jednym widoku." },
  organizations: { title: "Organizacje klientów", description: "Prawdziwe biura, ich portale, zespoły i firmy klientów." },
  users: { title: "Użytkownicy platformy", description: "Konta supervisora, właścicieli i pracowników wszystkich organizacji." },
  settings: { title: "Ustawienia administratora", description: "Dane konta, bezpieczeństwo i konfiguracja panelu głównego." },
};

export default function SupervisorPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const loadTenants = useCallback(async () => {
    const response = await fetch("/api/supervisor/tenants", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/logowanie");
      return;
    }
    const payload = (await response.json()) as { tenants?: Tenant[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Nie udało się pobrać organizacji.");
    setTenants(payload.tenants || []);
  }, [router]);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/supervisor/users", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/logowanie");
      return;
    }
    const payload = (await response.json()) as { users?: PlatformUser[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Nie udało się pobrać użytkowników.");
    setUsers(payload.users || []);
  }, [router]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (window.localStorage.getItem("epito-theme") === "dark") setTheme("dark");
      Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error("Brak sesji");
          const payload = (await response.json()) as { session: Session };
          if (payload.session.platformRole !== "supervisor") throw new Error("Brak uprawnień");
          setSession(payload.session);
        }),
        loadTenants(),
        loadUsers(),
      ])
        .catch(() => router.replace("/logowanie"))
        .finally(() => setLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadTenants, loadUsers, router]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("epito-theme", next);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/logowanie");
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/supervisor/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się utworzyć organizacji.");
      formElement.reset();
      await Promise.all([loadTenants(), loadUsers()]);
      setModalOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się utworzyć organizacji.");
    } finally {
      setPending(false);
    }
  }

  async function openTenant(tenantId: string) {
    const response = await fetch("/api/supervisor/select-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (response.ok) router.push("/workspace");
  }

  const totalClients = tenants.reduce((sum, tenant) => sum + tenant.clientsCount, 0);
  const totalUsers = tenants.reduce((sum, tenant) => sum + tenant.usersCount, 0);
  const navigation: Array<{ id: Section; label: string; icon: typeof LayoutDashboard }> = [
    { id: "overview", label: "Przegląd", icon: LayoutDashboard },
    { id: "organizations", label: "Organizacje", icon: Building2 },
    { id: "users", label: "Użytkownicy", icon: Users },
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
          <Link className={styles.brand} href="/admin"><span className={styles.brandMark}>E</span><span>EPITO</span></Link>
          <nav>
            <p className={styles.navLabel}>Panel platformy</p>
            <div className={styles.navList}>{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} className={section === item.id ? styles.navItemActive : styles.navItem} type="button" onClick={() => setSection(item.id)}><Icon size={21} /> {item.label}</button>; })}</div>
          </nav>
          <div className={styles.sidebarBottom}><p className={styles.navLabel}>Tryb supervisora</p><button className={styles.navItem} type="button" onClick={logout}><LogOut size={21} /> Wyloguj się</button></div>
        </aside>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <div className={styles.topbarTitle}><strong>{session?.fullName || "Supervisor"}</strong><span>{session?.email}</span></div>
            <div className={styles.topbarActions}>
              <Link className={styles.buttonGhost} href="/panel"><ExternalLink size={17} /> Publiczne demo</Link>
              <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={toggleTheme} aria-label="Zmień motyw">{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}</button>
              {section !== "users" && section !== "settings" ? <button className={styles.buttonPrimary} type="button" onClick={() => setModalOpen(true)}><Plus size={19} /> Nowa organizacja</button> : null}
            </div>
          </header>

          {loading ? <div className={styles.loading}>Ładowanie danych platformy…</div> : (
            <div className={styles.content}>
              <div className={styles.headingRow}><div><h1>{sectionTitle[section].title}</h1><p>{sectionTitle[section].description}</p></div></div>
              <div className={styles.tabs} aria-label="Działy administracji">
                {navigation.map((item) => <button key={item.id} className={section === item.id ? styles.tabActive : styles.tab} type="button" onClick={() => setSection(item.id)}>{item.label}{item.id === "organizations" ? ` (${tenants.length})` : item.id === "users" ? ` (${users.length})` : ""}</button>)}
              </div>

              {section === "overview" ? (
                <>
                  <section className={styles.statsGrid} aria-label="Statystyki platformy">
                    <article className={styles.statCard}><span className={styles.statIcon}><Building2 size={21} /></span><strong>{tenants.length}</strong><span>organizacji</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><ShieldCheck size={21} /></span><strong>{tenants.filter((tenant) => tenant.status === "active").length}</strong><span>aktywnych portali</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><Users size={21} /></span><strong>{totalUsers}</strong><span>użytkowników w organizacjach</span></article>
                    <article className={styles.statCard}><span className={styles.statIcon}><LayoutDashboard size={21} /></span><strong>{totalClients}</strong><span>firm klientów</span></article>
                  </section>
                  <TenantsPanel tenants={tenants.slice(0, 5)} onOpen={openTenant} onCreate={() => setModalOpen(true)} compact />
                </>
              ) : null}

              {section === "organizations" ? <TenantsPanel tenants={tenants} onOpen={openTenant} onCreate={() => setModalOpen(true)} /> : null}

              {section === "users" ? (
                <section className={styles.panel}>
                  <header className={styles.panelHeader}><div><h2>Wszystkie konta</h2><p>Lista jest pobierana z produkcyjnej bazy i obejmuje wszystkie organizacje.</p></div></header>
                  {users.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Użytkownik</th><th>Organizacja</th><th>Rola</th><th>Typ konta</th><th>Status</th></tr></thead><tbody>{users.map((user) => <tr key={`${user.id}-${user.tenant_name || "platform"}`}><td><strong>{user.full_name}</strong><small>{user.email}</small></td><td>{user.tenant_name || "Platforma Epito"}</td><td>{user.membership_role || (user.platform_role === "supervisor" ? "Supervisor" : "—")}</td><td>{user.platform_role === "supervisor" ? "Administrator platformy" : "Użytkownik organizacji"}</td><td><span className={styles.status}>{user.status === "active" ? "Aktywny" : user.status}</span></td></tr>)}</tbody></table></div> : <Empty title="Brak użytkowników" text="Konta pojawią się po utworzeniu pierwszej organizacji." />}
                </section>
              ) : null}

              {section === "settings" ? (
                <div className={styles.twoColumns}>
                  <section className={`${styles.panel} ${styles.formPanel}`}><h2>Konto supervisora</h2><p>Dane konta głównego administratora platformy.</p><div className={styles.infoList}><div><span>Imię i nazwisko</span><strong>{session?.fullName}</strong></div><div><span>Adres e-mail</span><strong>{session?.email}</strong></div><div><span>Uprawnienia</span><strong>Supervisor</strong></div><div><span>Zakres</span><strong>Wszystkie organizacje</strong></div></div></section>
                  <PasswordForm />
                </div>
              ) : null}
            </div>
          )}
        </main>
      </div>

      {modalOpen ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tenant-title">
            <header className={styles.modalHeader}><div><h2 id="tenant-title">Nowa organizacja</h2><p>Epito utworzy portal oraz pierwsze konto właściciela biura.</p></div><button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={() => setModalOpen(false)} aria-label="Zamknij"><X size={20} /></button></header>
            <form className={styles.formGrid} onSubmit={createTenant}>
              <div className={styles.field}><label htmlFor="displayName">Nazwa w panelu</label><input id="displayName" name="displayName" required maxLength={100} placeholder="Kowalscy Księgowość" /></div>
              <div className={styles.field}><label htmlFor="legalName">Pełna nazwa firmy</label><input id="legalName" name="legalName" required maxLength={180} placeholder="Kowalscy Księgowość sp. z o.o." /></div>
              <div className={styles.field}><label htmlFor="nip">NIP</label><input id="nip" name="nip" inputMode="numeric" maxLength={10} placeholder="1234567890" /></div>
              <div className={styles.field}><label htmlFor="slug">Adres portalu</label><input id="slug" name="slug" required minLength={3} maxLength={63} pattern="[a-z0-9][a-z0-9-]{2,62}" placeholder="kowalscy" /><small>Małe litery, cyfry i łącznik. Zostanie utworzony adres w domenie Epito.</small></div>
              <hr className={styles.formDivider} />
              <div className={styles.field}><label htmlFor="ownerName">Imię i nazwisko właściciela</label><input id="ownerName" name="ownerName" required maxLength={120} autoComplete="name" /></div>
              <div className={styles.field}><label htmlFor="ownerEmail">E-mail właściciela</label><input id="ownerEmail" name="ownerEmail" type="email" required maxLength={254} autoComplete="email" /></div>
              <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="ownerPassword">Hasło startowe</label><input id="ownerPassword" name="ownerPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, przynajmniej jedna litera i jedna cyfra.</small></div>
              {error ? <div className={styles.error} role="alert">{error}</div> : null}
              <div className={styles.formActions}><button className={styles.buttonGhost} type="button" onClick={() => setModalOpen(false)}>Anuluj</button><button className={styles.buttonPrimary} type="submit" disabled={pending}>{pending ? "Tworzę organizację…" : "Utwórz organizację"}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function TenantsPanel({ tenants, onOpen, onCreate, compact = false }: { tenants: Tenant[]; onOpen: (id: string) => void; onCreate: () => void; compact?: boolean }) {
  return <section className={styles.panel}><header className={styles.panelHeader}><div><h2>{compact ? "Ostatnie organizacje" : "Organizacje klientów"}</h2><p>Każda organizacja ma własny portal i izolację danych RLS.</p></div><button className={styles.buttonSecondary} type="button" onClick={onCreate}><Plus size={18} /> Dodaj</button></header>{tenants.length === 0 ? <div className={styles.empty}><Building2 size={42} /><h3>Nie ma jeszcze organizacji</h3><p>Utwórz pierwsze biuro wraz z kontem właściciela.</p><button className={styles.buttonPrimary} type="button" onClick={onCreate}><Plus size={18} /> Utwórz pierwszą organizację</button></div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Organizacja</th><th>Portal</th><th>Klienci</th><th>Zespół</th><th>Status</th><th>Akcja</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id}><td><strong>{tenant.displayName}</strong><small>{tenant.legalName}{tenant.nip ? ` · NIP ${tenant.nip}` : ""}</small></td><td><strong>{tenant.portalHost}</strong><small>Utworzono {new Date(tenant.createdAt).toLocaleDateString("pl-PL")}</small></td><td>{tenant.clientsCount}</td><td>{tenant.usersCount}</td><td><span className={styles.status}>{tenant.status === "active" ? "Aktywna" : tenant.status}</span></td><td><button className={`${styles.buttonSecondary} ${styles.tableAction}`} type="button" onClick={() => onOpen(tenant.id)}>Otwórz <ArrowRight size={16} /></button></td></tr>)}</tbody></table></div>}</section>;
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
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())) });
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
  return <section className={`${styles.panel} ${styles.formPanel}`}><h2>Bezpieczeństwo konta</h2><p>Zmień hasło głównego administratora.</p><form className={styles.singleForm} onSubmit={changePassword}><div className={styles.field}><label htmlFor="adminCurrentPassword">Obecne hasło</label><input id="adminCurrentPassword" name="currentPassword" type="password" required autoComplete="current-password" /></div><div className={styles.field}><label htmlFor="adminNewPassword">Nowe hasło</label><input id="adminNewPassword" name="newPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, litera i cyfra.</small></div>{message ? <div className={message.includes("zmienione") ? styles.success : styles.error} role="status">{message}</div> : null}<button className={styles.buttonPrimary} type="submit" disabled={pending}>{pending ? "Zmieniam hasło…" : "Zmień hasło"}</button></form></section>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className={styles.empty}><Users size={40} /><h3>{title}</h3><p>{text}</p></div>;
}
