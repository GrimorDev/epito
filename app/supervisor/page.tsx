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

type Session = {
  fullName: string;
  email: string;
  platformRole: string;
};

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

export default function SupervisorPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
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
      ])
        .catch(() => router.replace("/logowanie"))
        .finally(() => setLoading(false));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadTenants, router]);

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
    const form = new FormData(formElement);
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/supervisor/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się utworzyć organizacji.");
      formElement.reset();
      await loadTenants();
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

  return (
    <div className={styles.shell} data-theme={theme}>
      <div className={styles.mobileHeader}>
        <span className={styles.brand}><span className={styles.brandMark}>E</span><span>EPITO</span></span>
        <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={toggleTheme} aria-label="Zmień motyw">
          {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>
      <div className={styles.appGrid}>
        <aside className={styles.sidebar}>
          <Link className={styles.brand} href="/supervisor"><span className={styles.brandMark}>E</span><span>EPITO</span></Link>
          <nav>
            <p className={styles.navLabel}>Panel platformy</p>
            <div className={styles.navList}>
              <span className={styles.navItemActive}><LayoutDashboard size={21} /> Przegląd</span>
              <span className={styles.navItem}><Building2 size={21} /> Organizacje</span>
              <span className={styles.navItem}><Users size={21} /> Użytkownicy</span>
              <span className={styles.navItem}><Settings size={21} /> Ustawienia</span>
            </div>
          </nav>
          <div className={styles.sidebarBottom}>
            <p className={styles.navLabel}>Tryb supervisora</p>
            <button className={styles.navItem} type="button" onClick={logout}><LogOut size={21} /> Wyloguj się</button>
          </div>
        </aside>

        <main className={styles.main}>
          <header className={styles.topbar}>
            <div className={styles.topbarTitle}>
              <strong>{session?.fullName || "Supervisor"}</strong>
              <span>{session?.email}</span>
            </div>
            <div className={styles.topbarActions}>
              <Link className={styles.buttonGhost} href="/panel"><ExternalLink size={17} /> Publiczne demo</Link>
              <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={toggleTheme} aria-label="Zmień motyw">
                {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
              </button>
              <button className={styles.buttonPrimary} type="button" onClick={() => setModalOpen(true)}><Plus size={19} /> Nowa organizacja</button>
            </div>
          </header>

          {loading ? <div className={styles.loading}>Ładowanie danych platformy…</div> : (
            <div className={styles.content}>
              <div className={styles.headingRow}>
                <div>
                  <h1>Centrum zarządzania</h1>
                  <p>Prawdziwe organizacje, konta właścicieli i dane klientów w jednym widoku.</p>
                </div>
              </div>

              <section className={styles.statsGrid} aria-label="Statystyki platformy">
                <article className={styles.statCard}><span className={styles.statIcon}><Building2 size={21} /></span><strong>{tenants.length}</strong><span>organizacji</span></article>
                <article className={styles.statCard}><span className={styles.statIcon}><ShieldCheck size={21} /></span><strong>{tenants.filter((tenant) => tenant.status === "active").length}</strong><span>aktywnych portali</span></article>
                <article className={styles.statCard}><span className={styles.statIcon}><Users size={21} /></span><strong>{totalUsers}</strong><span>użytkowników</span></article>
                <article className={styles.statCard}><span className={styles.statIcon}><LayoutDashboard size={21} /></span><strong>{totalClients}</strong><span>firm klientów</span></article>
              </section>

              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div><h2>Organizacje klientów</h2><p>Każda organizacja ma własny portal i izolację danych RLS.</p></div>
                  <button className={styles.buttonSecondary} type="button" onClick={() => setModalOpen(true)}><Plus size={18} /> Dodaj</button>
                </header>
                {tenants.length === 0 ? (
                  <div className={styles.empty}>
                    <Building2 size={42} />
                    <h3>Nie ma jeszcze organizacji</h3>
                    <p>Utwórz pierwsze biuro wraz z kontem właściciela. Od razu będzie mogło zalogować się i dodać swoich klientów.</p>
                    <button className={styles.buttonPrimary} type="button" onClick={() => setModalOpen(true)}><Plus size={18} /> Utwórz pierwszą organizację</button>
                  </div>
                ) : (
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead><tr><th>Organizacja</th><th>Portal</th><th>Klienci</th><th>Zespół</th><th>Status</th><th>Akcja</th></tr></thead>
                      <tbody>{tenants.map((tenant) => (
                        <tr key={tenant.id}>
                          <td><strong>{tenant.displayName}</strong><small>{tenant.legalName}{tenant.nip ? ` · NIP ${tenant.nip}` : ""}</small></td>
                          <td><strong>{tenant.portalHost}</strong><small>Utworzono {new Date(tenant.createdAt).toLocaleDateString("pl-PL")}</small></td>
                          <td>{tenant.clientsCount}</td>
                          <td>{tenant.usersCount}</td>
                          <td><span className={styles.status}>{tenant.status === "active" ? "Aktywna" : tenant.status}</span></td>
                          <td><button className={`${styles.buttonSecondary} ${styles.tableAction}`} type="button" onClick={() => openTenant(tenant.id)}>Otwórz <ArrowRight size={16} /></button></td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      {modalOpen ? (
        <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tenant-title">
            <header className={styles.modalHeader}>
              <div><h2 id="tenant-title">Nowa organizacja</h2><p>Epito utworzy portal oraz pierwsze konto właściciela biura.</p></div>
              <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={() => setModalOpen(false)} aria-label="Zamknij"><X size={20} /></button>
            </header>
            <form className={styles.formGrid} onSubmit={createTenant}>
              <div className={styles.field}><label htmlFor="displayName">Nazwa w panelu</label><input id="displayName" name="displayName" required maxLength={100} placeholder="Kowalscy Księgowość" /></div>
              <div className={styles.field}><label htmlFor="legalName">Pełna nazwa firmy</label><input id="legalName" name="legalName" required maxLength={180} placeholder="Kowalscy Księgowość sp. z o.o." /></div>
              <div className={styles.field}><label htmlFor="nip">NIP</label><input id="nip" name="nip" inputMode="numeric" maxLength={10} placeholder="1234567890" /></div>
              <div className={styles.field}><label htmlFor="slug">Adres portalu</label><input id="slug" name="slug" required minLength={3} maxLength={63} pattern="[a-z0-9][a-z0-9-]{2,62}" placeholder="kowalscy" /><small>Małe litery, cyfry i łącznik. Zostanie utworzony adres w domenie Epito.</small></div>
              <hr className={styles.formDivider} />
              <div className={styles.field}><label htmlFor="ownerName">Imię i nazwisko właściciela</label><input id="ownerName" name="ownerName" required maxLength={120} autoComplete="name" /></div>
              <div className={styles.field}><label htmlFor="ownerEmail">E-mail właściciela</label><input id="ownerEmail" name="ownerEmail" type="email" required maxLength={254} autoComplete="email" /></div>
              <div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="ownerPassword">Hasło startowe</label><input id="ownerPassword" name="ownerPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, przynajmniej jedna litera i jedna cyfra. Przekaż hasło właścicielowi bezpiecznym kanałem.</small></div>
              {error ? <div className={styles.error} role="alert">{error}</div> : null}
              <div className={styles.formActions}>
                <button className={styles.buttonGhost} type="button" onClick={() => setModalOpen(false)}>Anuluj</button>
                <button className={styles.buttonPrimary} type="submit" disabled={pending}>{pending ? "Tworzę organizację…" : "Utwórz organizację"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
