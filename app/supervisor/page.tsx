"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  Copy,
  ExternalLink,
  FileWarning,
  Headphones,
  KeyRound,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  TerminalSquare,
  UserCog,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  canManageOrganizations,
  canManagePlatformTeam,
  platformRoleDescriptions,
  platformRoleLabels,
  platformRoles,
  platformTenantAccessLabel,
  type PlatformRole,
} from "@/lib/platform-access";
import styles from "../secure.module.css";
import admin from "./supervisor.module.css";

type Session = { fullName: string; email: string; platformRole: PlatformRole };
type Section = "overview" | "organizations" | "organizationUsers" | "platformTeam" | "settings";
type Modal = "tenant" | "staff" | null;

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
  documentsCount: number;
  requiresActionCount: number;
  duePaymentsCount: number;
  failedPaymentsCount: number;
  portalHost: string;
};

type ActivityEntry = {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  tenantName: string;
  actorName: string | null;
};

type PlatformUser = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  platform_role: PlatformRole;
  mfa_enabled: boolean;
  last_login_at: string | null;
  tenant_id: string | null;
  tenant_slug: string | null;
  tenant_name: string | null;
  membership_role: string | null;
  membership_status: string | null;
  permissions: Record<string, boolean> | null;
  created_at: string;
};

const sectionTitle: Record<Section, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "Control plane", title: "Centrum operacyjne", description: "Stan platformy, zdarzenia wymagające reakcji i ostatnie działania zespołu." },
  organizations: { eyebrow: "Tenanty", title: "Organizacje", description: "Portale klientów, ich wykorzystanie oraz bezpieczny dostęp techniczny." },
  organizationUsers: { eyebrow: "Dostępy klientów", title: "Użytkownicy organizacji", description: "Hierarchia kont, role i zakres uprawnień w każdej organizacji." },
  platformTeam: { eyebrow: "Zespół wewnętrzny", title: "Zespół platformy", description: "Helpdesk, moderatorzy, developerzy i administratorzy Epito." },
  settings: { eyebrow: "Bezpieczeństwo", title: "Ustawienia supervisora", description: "Dane konta głównego, zakres dostępu i zmiana hasła." },
};

const tenantRoleLabels: Record<string, string> = {
  owner: "Właściciel",
  admin: "Administrator",
  accountant: "Księgowy",
  employee: "Pracownik",
  viewer: "Podgląd",
};

const tenantRolePermissions: Record<string, string[]> = {
  owner: ["Pełna kontrola", "Zespół", "Ustawienia", "Finanse"],
  admin: ["Zespół", "Ustawienia", "Dokumenty", "Finanse"],
  accountant: ["Dokumenty", "Płatności", "KSeF"],
  employee: ["Dokumenty", "Klienci"],
  viewer: ["Tylko podgląd"],
};

const activityLabels: Record<string, string> = {
  "tenant.created": "Utworzono organizację",
  "user.created": "Dodano użytkownika",
  "membership.updated": "Zmieniono uprawnienia",
  "document.created": "Dodano dokument",
  "document.updated": "Zaktualizowano dokument",
  "payment.created": "Dodano płatność",
  "invoice.issued": "Wystawiono fakturę",
  "invoice.retry_requested": "Ponowiono wysyłkę faktury",
  "invoice.cancelled": "Anulowano próbę wysyłki faktury",
  "invoice.accepted": "KSeF przyjął fakturę",
  "invoice.rejected": "KSeF odrzucił fakturę",
  "invoice.issue_failed": "Błąd wysyłki faktury",
  "platform_user.created": "Utworzono konto zespołu",
  "platform_user.updated": "Zmieniono rolę platformową",
  "tenant.support_accessed": "Otwarto dostęp techniczny",
};

const navigation: Array<{ id: Section; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "Centrum operacyjne", icon: CircleGauge },
  { id: "organizations", label: "Organizacje", icon: Building2 },
  { id: "organizationUsers", label: "Użytkownicy firm", icon: Users },
  { id: "platformTeam", label: "Zespół platformy", icon: UserCog },
  { id: "settings", label: "Ustawienia", icon: Settings },
];

function dateLabel(value: string | null) {
  if (!value) return "Brak logowania";
  return new Date(value).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "EP";
}

export default function SupervisorPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Modal>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingAccess, setPendingAccess] = useState("");
  const [error, setError] = useState("");
  const [accessMessage, setAccessMessage] = useState("");
  const [createdPortalHost, setCreatedPortalHost] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [search, setSearch] = useState("");
  const [expandedTenant, setExpandedTenant] = useState<string | null>(null);

  const loadTenants = useCallback(async () => {
    const response = await fetch("/api/supervisor/tenants", { cache: "no-store" });
    if (response.status === 401) {
      router.replace("/logowanie");
      return;
    }
    const payload = (await response.json()) as { tenants?: Tenant[]; activity?: ActivityEntry[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Nie udało się pobrać organizacji.");
    setTenants(payload.tenants || []);
    setActivity(payload.activity || []);
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
      if (window.localStorage.getItem("epito-admin-theme") === "light") setTheme("light");
      Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
          if (!response.ok) throw new Error("Brak sesji");
          const payload = (await response.json()) as { session: Session };
          if (payload.session.platformRole === "none") throw new Error("Brak uprawnień");
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

  const platformTeam = useMemo(() => {
    const seen = new Set<string>();
    return users.filter((user) => {
      if (user.platform_role === "none" || seen.has(user.id)) return false;
      seen.add(user.id);
      return true;
    });
  }, [users]);

  const organizationGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pl-PL");
    return tenants
      .map((tenant) => ({
        tenant,
        members: users.filter((user) => user.tenant_id === tenant.id && (!query || `${user.full_name} ${user.email} ${tenant.displayName}`.toLocaleLowerCase("pl-PL").includes(query))),
      }))
      .filter((group) => !query || group.members.length > 0 || group.tenant.displayName.toLocaleLowerCase("pl-PL").includes(query));
  }, [search, tenants, users]);

  const uniqueOrganizationUsers = new Set(users.filter((user) => user.tenant_id).map((user) => user.id)).size;
  const requiresAction = tenants.reduce((sum, tenant) => sum + tenant.requiresActionCount, 0);
  const failedPayments = tenants.reduce((sum, tenant) => sum + tenant.failedPaymentsCount, 0);
  const duePayments = tenants.reduce((sum, tenant) => sum + tenant.duePaymentsCount, 0);
  const totalClients = tenants.reduce((sum, tenant) => sum + tenant.clientsCount, 0);
  const canCreateOrganizations = canManageOrganizations(session?.platformRole);
  const canManageTeam = canManagePlatformTeam(session?.platformRole);

  function selectSection(next: Section) {
    setSection(next);
    setMobileNavOpen(false);
    setSearch("");
  }

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("epito-admin-theme", next);
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
      const payload = (await response.json()) as { error?: string; portalHost?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się utworzyć organizacji.");
      formElement.reset();
      await Promise.all([loadTenants(), loadUsers()]);
      setModal(null);
      setCreatedPortalHost(payload.portalHost || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się utworzyć organizacji.");
    } finally {
      setPending(false);
    }
  }

  async function createPlatformUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/supervisor/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(formElement).entries())),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się utworzyć konta.");
      formElement.reset();
      await loadUsers();
      setModal(null);
      setAccessMessage("Konto zespołu zostało utworzone.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się utworzyć konta.");
    } finally {
      setPending(false);
    }
  }

  async function openTenant(tenantId: string) {
    setPendingAccess(`tenant:${tenantId}`);
    setAccessMessage("");
    const response = await fetch("/api/supervisor/select-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (response.ok) router.push("/workspace");
    else setAccessMessage(payload.error || "Nie udało się otworzyć organizacji.");
    setPendingAccess("");
  }

  async function updatePlatformAccess(user: PlatformUser, platformRole: PlatformRole, status: string) {
    const key = `platform:${user.id}`;
    setPendingAccess(key);
    setAccessMessage("");
    const response = await fetch("/api/supervisor/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "platform", userId: user.id, platformRole, status }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setAccessMessage(payload.error || "Nie udało się zmienić dostępu.");
    else {
      setAccessMessage("Uprawnienia zespołu zostały zapisane.");
      await loadUsers();
    }
    setPendingAccess("");
  }

  async function updateMembership(user: PlatformUser, role: string, status: string) {
    if (!user.tenant_id) return;
    const key = `membership:${user.tenant_id}:${user.id}`;
    setPendingAccess(key);
    setAccessMessage("");
    const response = await fetch("/api/supervisor/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "membership", userId: user.id, tenantId: user.tenant_id, role, status }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setAccessMessage(payload.error || "Nie udało się zmienić roli.");
    else {
      setAccessMessage("Rola użytkownika organizacji została zapisana.");
      await Promise.all([loadUsers(), loadTenants()]);
    }
    setPendingAccess("");
  }

  const currentTitle = sectionTitle[section];

  return (
    <div className={`${styles.shell} ${admin.adminShell}`} data-theme={theme}>
      <div className={`${styles.mobileHeader} ${admin.mobileHeader}`}>
        <span className={styles.brand}><span className={`${styles.brandMark} ${admin.brandMark}`}>E</span><span>EPITO OPS</span></span>
        <div className={admin.mobileHeaderActions}><button className={admin.mobileMenuButton} type="button" onClick={toggleTheme} aria-label="Zmień motyw">{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}</button><button className={admin.mobileMenuButton} type="button" onClick={() => setMobileNavOpen((value) => !value)} aria-label="Otwórz nawigację"><Menu size={22} /></button></div>
      </div>
      {mobileNavOpen ? <div className={admin.mobileNav}><AdminNavigation section={section} onSelect={selectSection} onLogout={logout} /></div> : null}

      <div className={styles.appGrid}>
        <aside className={`${styles.sidebar} ${admin.sidebar}`}>
          <Link className={styles.brand} href="/admin"><span className={`${styles.brandMark} ${admin.brandMark}`}>E</span><span>EPITO</span></Link>
          <div className={admin.environmentBadge}><LockKeyhole size={15} /><span><strong>CONTROL PLANE</strong><small>Środowisko produkcyjne</small></span></div>
          <AdminNavigation section={section} onSelect={selectSection} onLogout={logout} />
        </aside>

        <main className={`${styles.main} ${admin.main}`}>
          <header className={`${styles.topbar} ${admin.topbar}`}>
            <div className={admin.operatorIdentity}>
              <span className={admin.avatar}>{initials(session?.fullName || "Supervisor")}</span>
              <span><strong>{session?.fullName || "Supervisor"}</strong><small>{session ? platformRoleLabels[session.platformRole] : "Weryfikacja dostępu"}</small></span>
            </div>
            <div className={styles.topbarActions}>
              <Link className={styles.buttonGhost} href="/panel"><ExternalLink size={17} /> Publiczne demo</Link>
              <button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={toggleTheme} aria-label="Zmień motyw">{theme === "light" ? <Moon size={20} /> : <Sun size={20} />}</button>
              {canCreateOrganizations && (section === "overview" || section === "organizations") ? <button className={styles.buttonPrimary} type="button" onClick={() => setModal("tenant")}><Plus size={19} /> Nowa organizacja</button> : null}
              {canManageTeam && section === "platformTeam" ? <button className={styles.buttonPrimary} type="button" onClick={() => setModal("staff")}><UserPlus size={19} /> Dodaj konto</button> : null}
            </div>
          </header>

          {createdPortalHost ? <div className={`${styles.success} ${styles.portalSuccess}`} role="status"><span><strong>Organizacja jest gotowa</strong><small>Bezpieczny adres logowania klienta</small></span><a href={`https://${createdPortalHost}`} target="_blank" rel="noreferrer">https://{createdPortalHost}</a><button type="button" onClick={() => void navigator.clipboard.writeText(`https://${createdPortalHost}`)}><Copy size={16} /> Kopiuj</button><button type="button" onClick={() => setCreatedPortalHost("")} aria-label="Zamknij"><X size={17} /></button></div> : null}
          {accessMessage ? <div className={admin.systemMessage} role="status"><ShieldCheck size={18} /><span>{accessMessage}</span><button type="button" onClick={() => setAccessMessage("")} aria-label="Zamknij komunikat"><X size={17} /></button></div> : null}

          {loading ? <div className={styles.loading}>Ładowanie centrum operacyjnego…</div> : (
            <div className={`${styles.content} ${admin.content}`}>
              <div className={`${styles.headingRow} ${admin.headingRow}`}><div><span className={admin.eyebrow}>{currentTitle.eyebrow}</span><h1>{currentTitle.title}</h1><p>{currentTitle.description}</p></div><div className={admin.scopeBadge}><ShieldCheck size={17} /><span><small>Twój zakres</small><strong>{platformTenantAccessLabel(session?.platformRole)}</strong></span></div></div>

              <motion.div key={section} initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                {section === "overview" ? <OverviewSection tenants={tenants} activity={activity} uniqueUsers={uniqueOrganizationUsers} requiresAction={requiresAction} failedPayments={failedPayments} duePayments={duePayments} totalClients={totalClients} teamCount={platformTeam.length} onOpen={openTenant} pendingAccess={pendingAccess} /> : null}
                {section === "organizations" ? <TenantsPanel tenants={tenants} onOpen={openTenant} onCreate={() => setModal("tenant")} canCreate={canCreateOrganizations} pendingAccess={pendingAccess} /> : null}
                {section === "organizationUsers" ? <OrganizationUsers groups={organizationGroups} search={search} onSearch={setSearch} expandedTenant={expandedTenant} onToggle={(tenantId) => setExpandedTenant((current) => current === tenantId ? "" : tenantId)} canManage={canManageTeam} pendingAccess={pendingAccess} onUpdate={updateMembership} /> : null}
                {section === "platformTeam" ? <PlatformTeam users={platformTeam} currentUserId={session?.email || ""} canManage={canManageTeam} pendingAccess={pendingAccess} onCreate={() => setModal("staff")} onUpdate={updatePlatformAccess} /> : null}
                {section === "settings" ? <SettingsSection session={session} /> : null}
              </motion.div>
            </div>
          )}
        </main>
      </div>

      {modal === "tenant" ? <TenantModal pending={pending} error={error} onClose={() => { setModal(null); setError(""); }} onSubmit={createTenant} /> : null}
      {modal === "staff" ? <StaffModal pending={pending} error={error} onClose={() => { setModal(null); setError(""); }} onSubmit={createPlatformUser} /> : null}
    </div>
  );
}

function AdminNavigation({ section, onSelect, onLogout }: { section: Section; onSelect: (section: Section) => void; onLogout: () => void }) {
  return <><nav className={admin.navigation}><p className={styles.navLabel}>Panel platformy</p><div className={styles.navList}>{navigation.map((item) => { const Icon = item.icon; return <button key={item.id} className={`${section === item.id ? styles.navItemActive : styles.navItem} ${admin.navItem}`} type="button" onClick={() => onSelect(item.id)}><Icon size={20} /> {item.label}</button>; })}</div></nav><div className={`${styles.sidebarBottom} ${admin.sidebarBottom}`}><p className={styles.navLabel}>Sesja operatora</p><button className={`${styles.navItem} ${admin.navItem}`} type="button" onClick={onLogout}><LogOut size={20} /> Wyloguj się</button></div></>;
}

function OverviewSection({ tenants, activity, uniqueUsers, requiresAction, failedPayments, duePayments, totalClients, teamCount, onOpen, pendingAccess }: { tenants: Tenant[]; activity: ActivityEntry[]; uniqueUsers: number; requiresAction: number; failedPayments: number; duePayments: number; totalClients: number; teamCount: number; onOpen: (id: string) => void; pendingAccess: string }) {
  const activeTenants = tenants.filter((tenant) => tenant.status === "active").length;
  const attentionTenants = [...tenants].sort((a, b) => (b.requiresActionCount + b.failedPaymentsCount) - (a.requiresActionCount + a.failedPaymentsCount)).slice(0, 5);
  return <>
    <section className={`${styles.statsGrid} ${admin.statsGrid}`} aria-label="Statystyki platformy">
      <Metric icon={Building2} label="Aktywne organizacje" value={activeTenants} detail={`${totalClients} firm klientów`} tone="blue" />
      <Metric icon={Users} label="Użytkownicy organizacji" value={uniqueUsers} detail={`${teamCount} kont zespołu Epito`} tone="neutral" />
      <Metric icon={FileWarning} label="Dokumenty do sprawdzenia" value={requiresAction} detail={requiresAction ? "Wymagają reakcji zespołu" : "Brak zaległych analiz"} tone={requiresAction ? "warning" : "success"} />
      <Metric icon={AlertTriangle} label="Nieudane płatności" value={failedPayments} detail={`${duePayments} zobowiązań w toku`} tone={failedPayments ? "danger" : "success"} />
    </section>

    <div className={admin.overviewGrid}>
      <section className={`${styles.panel} ${admin.panel}`}>
        <header className={`${styles.panelHeader} ${admin.panelHeader}`}><div><span className={admin.panelEyebrow}>Priorytety</span><h2>Kolejka operacyjna</h2><p>Organizacje z największą liczbą spraw wymagających uwagi.</p></div><Activity size={22} /></header>
        <div className={admin.queueList}>{attentionTenants.length ? attentionTenants.map((tenant) => <div className={admin.queueItem} key={tenant.id}><span className={admin.tenantMonogram}>{initials(tenant.displayName)}</span><div><strong>{tenant.displayName}</strong><small>{tenant.requiresActionCount} dokumentów do sprawdzenia, {tenant.failedPaymentsCount} błędnych płatności</small></div><span className={tenant.requiresActionCount + tenant.failedPaymentsCount ? admin.riskBadge : admin.okBadge}>{tenant.requiresActionCount + tenant.failedPaymentsCount ? `${tenant.requiresActionCount + tenant.failedPaymentsCount} spraw` : "Stabilnie"}</span><button type="button" onClick={() => onOpen(tenant.id)} disabled={pendingAccess === `tenant:${tenant.id}`} aria-label={`Otwórz ${tenant.displayName}`}><ArrowRight size={18} /></button></div>) : <Empty icon={Building2} title="Brak organizacji" text="Pierwsze organizacje pojawią się tutaj po utworzeniu." />}</div>
      </section>

      <section className={`${styles.panel} ${admin.panel}`}>
        <header className={`${styles.panelHeader} ${admin.panelHeader}`}><div><span className={admin.panelEyebrow}>Audyt</span><h2>Ostatnia aktywność</h2><p>Zdarzenia zapisane w niezmiennym dzienniku PostgreSQL.</p></div><ShieldCheck size={22} /></header>
        <div className={admin.activityList}>{activity.length ? activity.map((entry) => <div className={admin.activityItem} key={entry.id}><span><CheckCircle2 size={17} /></span><div><strong>{activityLabels[entry.action] || entry.action}</strong><small>{entry.tenantName}{entry.actorName ? `, ${entry.actorName}` : ""}</small></div><time>{dateLabel(entry.createdAt)}</time></div>) : <Empty icon={Activity} title="Brak zdarzeń" text="Dziennik aktywności jest jeszcze pusty." />}</div>
      </section>
    </div>
  </>;
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: LucideIcon; label: string; value: number; detail: string; tone: "blue" | "neutral" | "warning" | "danger" | "success" }) {
  return <article className={`${styles.statCard} ${admin.metric} ${admin[`metric_${tone}`]}`}><div className={admin.metricTop}><span>{label}</span><span className={admin.metricIcon}><Icon size={20} /></span></div><strong>{value.toLocaleString("pl-PL")}</strong><small>{detail}</small></article>;
}

function TenantsPanel({ tenants, onOpen, onCreate, canCreate, pendingAccess }: { tenants: Tenant[]; onOpen: (id: string) => void; onCreate: () => void; canCreate: boolean; pendingAccess: string }) {
  return <section className={`${styles.panel} ${admin.panel}`}><header className={`${styles.panelHeader} ${admin.panelHeader}`}><div><span className={admin.panelEyebrow}>Rejestr tenantów</span><h2>Wszystkie organizacje</h2><p>Każda organizacja ma własny portal i izolowany zakres danych.</p></div>{canCreate ? <button className={styles.buttonSecondary} type="button" onClick={onCreate}><Plus size={18} /> Dodaj organizację</button> : null}</header>{tenants.length === 0 ? <Empty icon={Building2} title="Brak organizacji" text="Utwórz pierwsze biuro wraz z kontem właściciela." /> : <div className={styles.tableWrap}><table className={`${styles.table} ${admin.table}`}><thead><tr><th>Organizacja</th><th>Wykorzystanie</th><th>Stan operacyjny</th><th>Portal</th><th>Dostęp</th></tr></thead><tbody>{tenants.map((tenant) => <tr key={tenant.id}><td><div className={admin.identityCell}><span className={admin.tenantMonogram}>{initials(tenant.displayName)}</span><span><strong>{tenant.displayName}</strong><small>{tenant.legalName}{tenant.nip ? `, NIP ${tenant.nip}` : ""}</small></span></div></td><td><strong>{tenant.clientsCount} firm, {tenant.usersCount} osób</strong><small>{tenant.documentsCount} dokumentów</small></td><td><span className={tenant.requiresActionCount + tenant.failedPaymentsCount ? admin.riskBadge : admin.okBadge}>{tenant.requiresActionCount + tenant.failedPaymentsCount ? `${tenant.requiresActionCount + tenant.failedPaymentsCount} spraw` : "Stabilnie"}</span><small>{tenant.duePaymentsCount} płatności w toku</small></td><td><strong className={admin.mono}>{tenant.portalHost}</strong><small>Od {new Date(tenant.createdAt).toLocaleDateString("pl-PL")}</small></td><td><button className={`${styles.buttonSecondary} ${styles.tableAction}`} type="button" onClick={() => onOpen(tenant.id)} disabled={pendingAccess === `tenant:${tenant.id}`}><TerminalSquare size={16} /> {pendingAccess === `tenant:${tenant.id}` ? "Otwieranie" : "Wejdź technicznie"}</button></td></tr>)}</tbody></table></div>}</section>;
}

function OrganizationUsers({ groups, search, onSearch, expandedTenant, onToggle, canManage, pendingAccess, onUpdate }: { groups: Array<{ tenant: Tenant; members: PlatformUser[] }>; search: string; onSearch: (value: string) => void; expandedTenant: string | null; onToggle: (id: string) => void; canManage: boolean; pendingAccess: string; onUpdate: (user: PlatformUser, role: string, status: string) => void }) {
  return <div className={admin.usersWorkspace}>
    <div className={admin.filterBar}><label><Search size={18} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Szukaj osoby, e-maila lub organizacji" /></label><span>{groups.reduce((sum, group) => sum + group.members.length, 0)} przypisanych kont</span></div>
    <div className={admin.organizationList}>{groups.map(({ tenant, members }, index) => {
      const expanded = expandedTenant === tenant.id || (expandedTenant === null && index === 0);
      return <section className={admin.organizationGroup} key={tenant.id}><button className={admin.organizationHeader} type="button" onClick={() => onToggle(tenant.id)}><span className={admin.tenantMonogram}>{initials(tenant.displayName)}</span><span><strong>{tenant.displayName}</strong><small>{tenant.portalHost}</small></span><span className={admin.memberCount}>{members.length} {members.length === 1 ? "osoba" : "osób"}</span><ChevronDown className={expanded ? admin.chevronOpen : ""} size={20} /></button>{expanded ? <div className={admin.memberList}>{members.length ? members.map((user) => {
        const key = `membership:${tenant.id}:${user.id}`;
        const role = user.membership_role || "viewer";
        return <div className={admin.memberRow} key={`${tenant.id}:${user.id}`}><div className={admin.identityCell}><span className={admin.userAvatar}>{initials(user.full_name)}</span><span><strong>{user.full_name}</strong><small>{user.email}</small></span></div><div className={admin.permissionSummary}><strong>{tenantRoleLabels[role] || role}</strong><span>{(tenantRolePermissions[role] || ["Dostęp niestandardowy"]).map((permission) => <small key={permission}>{permission}</small>)}</span></div>{canManage ? <div className={admin.accessControls}><select value={role} disabled={pendingAccess === key} onChange={(event) => onUpdate(user, event.target.value, user.membership_status || "active")} aria-label={`Rola ${user.full_name}`}>{Object.entries(tenantRoleLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select value={user.membership_status || "active"} disabled={pendingAccess === key} onChange={(event) => onUpdate(user, role, event.target.value)} aria-label={`Status ${user.full_name}`}><option value="active">Aktywny</option><option value="blocked">Zablokowany</option></select></div> : <span className={styles.status}>{user.membership_status === "blocked" ? "Zablokowany" : "Aktywny"}</span>}</div>;
      }) : <div className={admin.groupEmpty}>Ta organizacja nie ma jeszcze użytkowników.</div>}</div> : null}</section>;
    })}</div>
  </div>;
}

function PlatformTeam({ users, currentUserId, canManage, pendingAccess, onCreate, onUpdate }: { users: PlatformUser[]; currentUserId: string; canManage: boolean; pendingAccess: string; onCreate: () => void; onUpdate: (user: PlatformUser, role: PlatformRole, status: string) => void }) {
  return <div className={admin.teamWorkspace}>
    <section className={admin.roleMatrix}><header><div><span className={admin.panelEyebrow}>Model uprawnień</span><h2>Role operacyjne</h2></div>{canManage ? <button className={styles.buttonSecondary} type="button" onClick={onCreate}><UserPlus size={18} /> Dodaj konto</button> : null}</header><div>{platformRoles.map((role) => <article key={role}><span className={admin.roleIcon}>{role === "helpdesk" ? <Headphones size={19} /> : role === "developer" ? <TerminalSquare size={19} /> : role === "supervisor" ? <ShieldCheck size={19} /> : <UserCog size={19} />}</span><strong>{platformRoleLabels[role]}</strong><p>{platformRoleDescriptions[role]}</p></article>)}</div></section>
    <section className={`${styles.panel} ${admin.panel}`}><header className={`${styles.panelHeader} ${admin.panelHeader}`}><div><span className={admin.panelEyebrow}>Konta wewnętrzne</span><h2>Zespół Epito</h2><p>Dostęp do organizacji jest rejestrowany w dzienniku audytowym.</p></div><LockKeyhole size={22} /></header>{users.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${admin.table}`}><thead><tr><th>Osoba</th><th>Rola i zakres</th><th>Ostatnie logowanie</th><th>MFA</th><th>Status</th></tr></thead><tbody>{users.map((user) => {
      const key = `platform:${user.id}`;
      const isCurrent = user.email === currentUserId;
      return <tr key={user.id}><td><div className={admin.identityCell}><span className={admin.userAvatar}>{initials(user.full_name)}</span><span><strong>{user.full_name}{isCurrent ? " (Ty)" : ""}</strong><small>{user.email}</small></span></div></td><td>{canManage && !isCurrent ? <select className={admin.tableSelect} value={user.platform_role === "support" ? "helpdesk" : user.platform_role} disabled={pendingAccess === key} onChange={(event) => onUpdate(user, event.target.value as PlatformRole, user.status)}>{platformRoles.map((role) => <option value={role} key={role}>{platformRoleLabels[role]}</option>)}</select> : <strong>{platformRoleLabels[user.platform_role]}</strong>}<small>{user.platform_role === "support" ? platformRoleDescriptions.helpdesk : platformRoleDescriptions[user.platform_role as keyof typeof platformRoleDescriptions]}</small></td><td><strong>{dateLabel(user.last_login_at)}</strong><small>Konto od {new Date(user.created_at).toLocaleDateString("pl-PL")}</small></td><td><span className={user.mfa_enabled ? admin.okBadge : admin.neutralBadge}>{user.mfa_enabled ? "Włączone" : "Niewłączone"}</span></td><td>{canManage && !isCurrent ? <select className={admin.tableSelect} value={user.status} disabled={pendingAccess === key} onChange={(event) => onUpdate(user, user.platform_role === "support" ? "helpdesk" : user.platform_role, event.target.value)}><option value="active">Aktywny</option><option value="blocked">Zablokowany</option></select> : <span className={styles.status}>{user.status === "active" ? "Aktywny" : "Zablokowany"}</span>}</td></tr>;
    })}</tbody></table></div> : <Empty icon={UserCog} title="Brak zespołu" text="Dodaj pierwsze konto operacyjne platformy." />}</section>
  </div>;
}

function SettingsSection({ session }: { session: Session | null }) {
  return <div className={styles.twoColumns}><section className={`${styles.panel} ${styles.formPanel} ${admin.panel}`}><span className={admin.panelEyebrow}>Tożsamość operatora</span><h2>Konto główne</h2><p>Najwyższy poziom dostępu do warstwy administracyjnej.</p><div className={styles.infoList}><div><span>Imię i nazwisko</span><strong>{session?.fullName}</strong></div><div><span>Adres e-mail</span><strong>{session?.email}</strong></div><div><span>Rola platformowa</span><strong>{session ? platformRoleLabels[session.platformRole] : ""}</strong></div><div><span>Zakres</span><strong>{platformTenantAccessLabel(session?.platformRole)}</strong></div></div></section><PasswordForm /></div>;
}

function TenantModal({ pending, error, onClose, onSubmit }: { pending: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalFrame title="Nowa organizacja" description="Epito utworzy izolowany portal oraz pierwsze konto właściciela." onClose={onClose}><form className={styles.formGrid} onSubmit={onSubmit}><div className={styles.field}><label htmlFor="displayName">Nazwa w panelu</label><input id="displayName" name="displayName" required maxLength={100} /></div><div className={styles.field}><label htmlFor="legalName">Pełna nazwa firmy</label><input id="legalName" name="legalName" required maxLength={180} /></div><div className={styles.field}><label htmlFor="nip">NIP</label><input id="nip" name="nip" inputMode="numeric" maxLength={10} /></div><div className={`${styles.field} ${styles.fieldFull}`}><span>Adres portalu</span><small>Zostanie nadany automatycznie w formacie clientXXXX.epito.pl.</small></div><hr className={styles.formDivider} /><div className={styles.field}><label htmlFor="ownerName">Imię i nazwisko właściciela</label><input id="ownerName" name="ownerName" required maxLength={120} autoComplete="name" /></div><div className={styles.field}><label htmlFor="ownerEmail">E-mail właściciela</label><input id="ownerEmail" name="ownerEmail" type="email" required maxLength={254} autoComplete="email" /></div><div className={`${styles.field} ${styles.fieldFull}`}><label htmlFor="ownerPassword">Hasło startowe</label><input id="ownerPassword" name="ownerPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, przynajmniej jedna litera i jedna cyfra.</small></div>{error ? <div className={styles.error} role="alert">{error}</div> : null}<div className={styles.formActions}><button className={styles.buttonGhost} type="button" onClick={onClose}>Anuluj</button><button className={styles.buttonPrimary} type="submit" disabled={pending}>{pending ? "Tworzenie…" : "Utwórz organizację"}</button></div></form></ModalFrame>;
}

function StaffModal({ pending, error, onClose, onSubmit }: { pending: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <ModalFrame title="Nowe konto platformowe" description="Dodaj pracownika wewnętrznego i nadaj mu kontrolowany zakres dostępu." onClose={onClose}><form className={styles.formGrid} onSubmit={onSubmit}><div className={styles.field}><label htmlFor="staffName">Imię i nazwisko</label><input id="staffName" name="fullName" required maxLength={120} autoComplete="name" /></div><div className={styles.field}><label htmlFor="staffEmail">E-mail służbowy</label><input id="staffEmail" name="email" type="email" required maxLength={254} autoComplete="email" /></div><div className={styles.field}><label htmlFor="platformRole">Rola</label><select id="platformRole" name="platformRole" defaultValue="helpdesk">{platformRoles.map((role) => <option value={role} key={role}>{platformRoleLabels[role]}</option>)}</select></div><div className={styles.field}><label htmlFor="staffPassword">Hasło startowe</label><input id="staffPassword" name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Pracownik powinien zmienić je po pierwszym logowaniu.</small></div>{error ? <div className={styles.error} role="alert">{error}</div> : null}<div className={styles.formActions}><button className={styles.buttonGhost} type="button" onClick={onClose}>Anuluj</button><button className={styles.buttonPrimary} type="submit" disabled={pending}>{pending ? "Tworzenie…" : "Utwórz konto"}</button></div></form></ModalFrame>;
}

function ModalFrame({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`${styles.modal} ${admin.modal}`} role="dialog" aria-modal="true" aria-labelledby="admin-modal-title"><header className={styles.modalHeader}><div><h2 id="admin-modal-title">{title}</h2><p>{description}</p></div><button className={`${styles.buttonGhost} ${styles.iconButton}`} type="button" onClick={onClose} aria-label="Zamknij"><X size={20} /></button></header>{children}</section></div>;
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
  return <section className={`${styles.panel} ${styles.formPanel} ${admin.panel}`}><span className={admin.panelEyebrow}>Logowanie</span><h2>Bezpieczeństwo konta</h2><p>Zmień hasło głównego operatora platformy.</p><form className={styles.singleForm} onSubmit={changePassword}><div className={styles.field}><label htmlFor="adminCurrentPassword">Obecne hasło</label><input id="adminCurrentPassword" name="currentPassword" type="password" required autoComplete="current-password" /></div><div className={styles.field}><label htmlFor="adminNewPassword">Nowe hasło</label><input id="adminNewPassword" name="newPassword" type="password" required minLength={12} maxLength={256} autoComplete="new-password" /><small>Minimum 12 znaków, litera i cyfra.</small></div>{message ? <div className={message.includes("zmienione") ? styles.success : styles.error} role="status">{message}</div> : null}<button className={styles.buttonPrimary} type="submit" disabled={pending}><KeyRound size={18} /> {pending ? "Zapisywanie…" : "Zmień hasło"}</button></form></section>;
}

function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div className={styles.empty}><Icon size={40} /><h3>{title}</h3><p>{text}</p></div>;
}
