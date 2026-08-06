"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  CreditCard,
  ExternalLink,
  FileClock,
  Globe2,
  LayoutDashboard,
  Menu,
  Moon,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

type AdminSection = "Pulpit" | "Biura klientów" | "Użytkownicy" | "Subskrypcje" | "Zdarzenia" | "Ustawienia";
type Workspace = {
  id: number;
  name: string;
  slug: string;
  owner: string;
  users: number;
  clients: number;
  plan: string;
  status: "Aktywne" | "Wdrożenie" | "Wstrzymane";
  mrr: string;
  lastSeen: string;
};

const seedWorkspaces: Workspace[] = [
  { id: 1, name: "Kowalski Studio", slug: "client231", owner: "marcin@kowalski-studio.pl", users: 3, clients: 1, plan: "Pro", status: "Aktywne", mrr: "349 zł", lastSeen: "2 min temu" },
  { id: 2, name: "Biuro Atlas", slug: "atlas", owner: "anna@biuroatlas.pl", users: 12, clients: 84, plan: "Pro", status: "Aktywne", mrr: "349 zł", lastSeen: "18 min temu" },
  { id: 3, name: "LexFin Księgowość", slug: "lexfin", owner: "kontakt@lexfin.pl", users: 7, clients: 46, plan: "Starter", status: "Wdrożenie", mrr: "149 zł", lastSeen: "Wczoraj" },
  { id: 4, name: "Nova Rachunkowość", slug: "nova", owner: "biuro@novarachunkowosc.pl", users: 18, clients: 132, plan: "Enterprise", status: "Aktywne", mrr: "648 zł", lastSeen: "34 min temu" },
  { id: 5, name: "Tax Partner", slug: "taxpartner", owner: "admin@taxpartner.pl", users: 5, clients: 29, plan: "Starter", status: "Wstrzymane", mrr: "0 zł", lastSeen: "12 dni temu" },
];

const navItems: { label: AdminSection; icon: LucideIcon }[] = [
  { label: "Pulpit", icon: LayoutDashboard },
  { label: "Biura klientów", icon: Building2 },
  { label: "Użytkownicy", icon: Users },
  { label: "Subskrypcje", icon: CreditCard },
  { label: "Zdarzenia", icon: FileClock },
  { label: "Ustawienia", icon: Settings },
];

export default function OwnerAdminPanel() {
  const [section, setSection] = useState<AdminSection>("Pulpit");
  const [workspaces, setWorkspaces] = useState(seedWorkspaces);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [plan, setPlan] = useState("Pro");

  function createWorkspace() {
    if (!companyName.trim() || !slug.trim() || !ownerEmail.trim()) return;
    const workspace: Workspace = {
      id: Date.now(),
      name: companyName.trim(),
      slug: slug.toLowerCase().replace(/[^a-z0-9]/g, ""),
      owner: ownerEmail.trim(),
      users: 1,
      clients: 0,
      plan,
      status: "Wdrożenie",
      mrr: plan === "Starter" ? "149 zł" : plan === "Pro" ? "349 zł" : "599 zł",
      lastSeen: "Jeszcze nieaktywne",
    };
    setWorkspaces((current) => [workspace, ...current]);
    setCreateOpen(false);
    setCompanyName("");
    setSlug("");
    setOwnerEmail("");
    setSection("Biura klientów");
  }

  const activeWorkspaces = workspaces.filter((item) => item.status === "Aktywne").length;
  const totalUsers = workspaces.reduce((sum, item) => sum + item.users, 0);

  return (
    <main className={darkMode ? "owner-shell owner-dark" : "owner-shell"}>
      <aside className={mobileMenu ? "owner-sidebar open" : "owner-sidebar"}>
        <div className="owner-brand"><span>R</span><div><strong>RACHUNO</strong><small>CONTROL</small></div></div>
        <button className="owner-mobile-close" onClick={() => setMobileMenu(false)}><X size={22} /></button>
        <div className="owner-role"><ShieldCheck size={18} /><div><small>ROLA</small><strong>Właściciel platformy</strong></div></div>
        <nav>
          <small>ZARZĄDZANIE</small>
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.label} className={section === item.label ? "active" : ""} onClick={() => { setSection(item.label); setMobileMenu(false); }}><Icon size={20} /><span>{item.label}</span>{item.label === "Biura klientów" && <b>{workspaces.length}</b>}</button>;
          })}
        </nav>
        <div className="owner-sidebar-footer"><span>Środowisko produkcyjne</span><strong>Wszystkie systemy działają</strong></div>
        <Link href="/panel"><ExternalLink size={16} /> Panel klienta</Link>
      </aside>

      {mobileMenu && <button className="owner-backdrop" onClick={() => setMobileMenu(false)} aria-label="Zamknij menu" />}

      <section className="owner-main">
        <header className="owner-topbar">
          <button className="owner-menu-button" onClick={() => setMobileMenu(true)}><Menu size={22} /></button>
          <div><small>RACHUNO CONTROL</small><strong>{section}</strong></div>
          <div className="owner-top-actions">
            <label className="owner-global-search"><Search size={18} /><input placeholder="Szukaj biura, użytkownika lub adresu" /></label>
            <button className="owner-theme-toggle" onClick={() => setDarkMode((value) => !value)}>{darkMode ? <Sun size={20} /> : <Moon size={20} />}</button>
            <button className="owner-notification"><Bell size={20} /><span>3</span></button>
            <button className="owner-profile"><span>KM</span><div><strong>Klaudia Mazur</strong><small>Super administrator</small></div><ChevronDown size={17} /></button>
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div className="owner-page" key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={{ duration: .2 }}>
            <div className="owner-page-heading"><div><p>6 sierpnia 2026</p><h1>{section === "Pulpit" ? "Centrum zarządzania platformą" : section}</h1><span>{section === "Pulpit" ? "Kontroluj organizacje, dostęp i kondycję całej usługi." : "Zarządzaj danymi i uprawnieniami na poziomie właściciela."}</span></div><button onClick={() => setCreateOpen(true)}><Plus size={19} /> Utwórz panel klienta</button></div>

            {section === "Pulpit" && (
              <>
                <div className="owner-metrics">
                  <article><span><Building2 size={22} /></span><div><small>AKTYWNE BIURA</small><strong>{activeWorkspaces}</strong><p>z {workspaces.length} organizacji</p></div><b>+2 w tym miesiącu</b></article>
                  <article><span><Users size={22} /></span><div><small>UŻYTKOWNICY</small><strong>{totalUsers}</strong><p>we wszystkich panelach</p></div><b>+8,4%</b></article>
                  <article><span><CircleDollarSign size={22} /></span><div><small>MRR</small><strong>14 950 zł</strong><p>przychód cykliczny</p></div><b>+12,1%</b></article>
                  <article><span><Activity size={22} /></span><div><small>AKTYWNOŚĆ</small><strong>98,7%</strong><p>paneli aktywnych w 30 dni</p></div><b>Stabilnie</b></article>
                </div>

                <div className="owner-dashboard-grid">
                  <article className="owner-card owner-tenant-card">
                    <div className="owner-card-head"><div><h3>Ostatnio aktywne biura</h3><p>Organizacje wymagające uwagi są pokazane jako pierwsze.</p></div><button onClick={() => setSection("Biura klientów")}>Wszystkie <ArrowRight size={15} /></button></div>
                    <WorkspaceTable workspaces={workspaces.slice(0, 4)} onSelect={setSelectedWorkspace} />
                  </article>
                  <article className="owner-card hierarchy-card">
                    <div className="owner-card-head"><div><h3>Model dostępu</h3><p>Hierarchia uprawnień platformy.</p></div></div>
                    <div className="hierarchy-flow">
                      <div className="hierarchy-level platform"><ShieldCheck size={21} /><span><small>POZIOM 1</small><strong>Rachuno</strong><p>Właściciel i supervisorzy</p></span></div>
                      <i />
                      <div className="hierarchy-level tenant"><Building2 size={21} /><span><small>POZIOM 2</small><strong>Biuro klienta</strong><p>Administrator organizacji</p></span></div>
                      <i />
                      <div className="hierarchy-level members"><Users size={21} /><span><small>POZIOM 3</small><strong>Pracownicy</strong><p>Role i ograniczony dostęp</p></span></div>
                    </div>
                    <div className="supervisor-note"><ShieldCheck size={18} /><p><strong>Dostęp supervisorski</strong>Każde wejście do panelu klienta trafia do dziennika audytowego.</p></div>
                  </article>
                </div>

                <div className="owner-dashboard-grid lower">
                  <article className="owner-card activity-card"><div className="owner-card-head"><div><h3>Ostatnie zdarzenia</h3><p>Najważniejsze operacje administratorskie.</p></div></div><div className="activity-list"><div><span><UserCog size={17} /></span><p><strong>Zmieniono rolę użytkownika</strong><small>Biuro Atlas, 12 minut temu</small></p></div><div><span><Globe2 size={17} /></span><p><strong>Utworzono nowy adres panelu</strong><small>lexfin.rachuno.pl, 2 godziny temu</small></p></div><div><span><CreditCard size={17} /></span><p><strong>Zmieniono plan na Enterprise</strong><small>Nova Rachunkowość, wczoraj</small></p></div></div></article>
                  <article className="owner-card provisioning-card"><div><span>NOWY PANEL</span><h3>Uruchom środowisko klienta w kilka minut.</h3><p>Adres, administrator i plan powstają w jednym procesie.</p><button onClick={() => setCreateOpen(true)}>Utwórz usługę <ArrowRight size={16} /></button></div><Globe2 size={90} /></article>
                </div>
              </>
            )}

            {section === "Biura klientów" && <article className="owner-card all-workspaces"><div className="owner-card-head"><div><h3>Wszystkie organizacje</h3><p>{workspaces.length} paneli klientów</p></div><div className="owner-table-filters"><button className="active">Wszystkie</button><button>Aktywne</button><button>Wdrożenie</button><button>Wstrzymane</button></div></div><WorkspaceTable workspaces={workspaces} onSelect={setSelectedWorkspace} /></article>}

            {section === "Użytkownicy" && <OwnerUsers workspaces={workspaces} />}
            {section === "Subskrypcje" && <Subscriptions />}
            {section === "Zdarzenia" && <AuditLog />}
            {section === "Ustawienia" && <OwnerSettings />}
          </motion.div>
        </AnimatePresence>
      </section>

      <AnimatePresence>
        {createOpen && (
          <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="workspace-create-modal" initial={{ opacity: 0, scale: .96, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }}>
              <button className="modal-close" onClick={() => setCreateOpen(false)}><X size={23} /></button>
              <span className="modal-kicker">NOWA ORGANIZACJA</span><h2>Utwórz panel klienta</h2><p>Rachuno przygotuje adres organizacji i konto jej pierwszego administratora.</p>
              <label>Nazwa firmy<input value={companyName} onChange={(event) => { setCompanyName(event.target.value); if (!slug) setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 18)); }} placeholder="Biuro rachunkowe Nova" /></label>
              <label>Adres panelu<div className="workspace-domain"><span>https://</span><input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} placeholder="nova" /><b>.rachuno.pl</b></div></label>
              <label>Administrator organizacji<input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="administrator@firma.pl" /></label>
              <label>Plan<select value={plan} onChange={(event) => setPlan(event.target.value)}><option>Starter</option><option>Pro</option><option>Enterprise</option></select></label>
              <div className="create-summary"><Check size={17} /><span>Powstanie odizolowana organizacja z własnymi użytkownikami, dokumentami i ustawieniami.</span></div>
              <button className="button button-primary button-wide" onClick={createWorkspace}>Utwórz usługę</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedWorkspace && <WorkspaceDrawer workspace={selectedWorkspace} onClose={() => setSelectedWorkspace(null)} />}
      </AnimatePresence>
    </main>
  );
}

function WorkspaceTable({ workspaces, onSelect }: { workspaces: Workspace[]; onSelect: (workspace: Workspace) => void }) {
  return <div className="owner-workspace-table"><div className="owner-table-head"><span>Organizacja</span><span>Adres panelu</span><span>Użytkownicy</span><span>Plan</span><span>Status</span><span>MRR</span><span /></div>{workspaces.map((workspace) => <button className="workspace-row" key={workspace.id} onClick={() => onSelect(workspace)}><span className="workspace-logo">{workspace.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><span className="workspace-name"><strong>{workspace.name}</strong><small>{workspace.owner}</small></span><span className="workspace-url">{workspace.slug}.rachuno.pl</span><span className="workspace-users"><Users size={15} /> {workspace.users}</span><span>{workspace.plan}</span><span className={`workspace-status ${workspace.status.toLowerCase()}`}>{workspace.status}</span><strong>{workspace.mrr}</strong><MoreHorizontal size={19} /></button>)}</div>;
}

function WorkspaceDrawer({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  return <><motion.button className="drawer-backdrop" onClick={onClose} aria-label="Zamknij" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside className="workspace-drawer" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 260 }}><header><span className="workspace-logo large">{workspace.name.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><small>ORGANIZACJA</small><h2>{workspace.name}</h2><p>{workspace.slug}.rachuno.pl</p></div><button onClick={onClose}><X size={22} /></button></header><div className="drawer-status"><span className={`workspace-status ${workspace.status.toLowerCase()}`}>{workspace.status}</span><span>Plan {workspace.plan}</span></div><section><h3>Administrator</h3><div className="drawer-owner"><span>AK</span><div><strong>{workspace.owner}</strong><small>Właściciel organizacji</small></div></div></section><section><h3>Podsumowanie</h3><div className="drawer-stats"><div><small>Użytkownicy</small><strong>{workspace.users}</strong></div><div><small>Klienci biura</small><strong>{workspace.clients}</strong></div><div><small>MRR</small><strong>{workspace.mrr}</strong></div><div><small>Aktywność</small><strong>{workspace.lastSeen}</strong></div></div></section><section><h3>Dostęp supervisor</h3><p className="drawer-copy">Wejście zostanie zapisane w dzienniku razem z czasem, operatorem i zakresem wykonanych zmian.</p><Link className="supervisor-button" href="/panel"><ShieldCheck size={18} /> Wejdź do panelu <ArrowRight size={17} /></Link></section><footer><button><Copy size={17} /> Kopiuj adres</button><button className="danger">Wstrzymaj usługę</button></footer></motion.aside></>;
}

function OwnerUsers({ workspaces }: { workspaces: Workspace[] }) {
  return <article className="owner-card admin-simple-card"><div className="owner-card-head"><div><h3>Użytkownicy platformy</h3><p>Łącznie {workspaces.reduce((sum, item) => sum + item.users, 0)} kont we wszystkich organizacjach.</p></div><label className="owner-global-search inline"><Search size={17} /><input placeholder="Szukaj użytkownika" /></label></div><div className="admin-user-list">{workspaces.slice(0, 4).map((workspace, index) => <div key={workspace.id}><span>{["MK", "AL", "PW", "JN"][index]}</span><div><strong>{workspace.owner}</strong><small>{workspace.name}</small></div><b>{index === 0 ? "Administrator" : "Użytkownik"}</b><span className="member-status active">Aktywny</span><button><MoreHorizontal size={19} /></button></div>)}</div></article>;
}

function Subscriptions() {
  return <div className="admin-section-grid"><article className="owner-card plan-card"><small>STARTER</small><h3>149 zł</h3><p>18 aktywnych biur</p><strong>2 682 zł MRR</strong></article><article className="owner-card plan-card featured"><small>PRO</small><h3>349 zł</h3><p>29 aktywnych biur</p><strong>10 121 zł MRR</strong></article><article className="owner-card plan-card"><small>ENTERPRISE</small><h3>od 599 zł</h3><p>4 aktywne biura</p><strong>2 147 zł MRR</strong></article></div>;
}

function AuditLog() {
  return <article className="owner-card admin-simple-card"><div className="owner-card-head"><div><h3>Dziennik zdarzeń</h3><p>Pełny audyt czynności administratorskich.</p></div></div><div className="audit-table">{["Wejście supervisor do organizacji Kowalski Studio", "Zmiana roli użytkownika w Biuro Atlas", "Utworzenie organizacji LexFin Księgowość", "Zmiana planu Nova Rachunkowość"].map((event, index) => <div key={event}><span><FileClock size={18} /></span><div><strong>{event}</strong><small>{["Dzisiaj, 10:42", "Dzisiaj, 09:18", "Wczoraj, 16:04", "Wczoraj, 12:33"][index]}</small></div><b>{index === 0 ? "Klaudia Mazur" : "System"}</b></div>)}</div></article>;
}

function OwnerSettings() {
  return <div className="admin-settings-grid"><article className="owner-card admin-settings-card"><Globe2 size={23} /><div><h3>Domena platformy</h3><p>Główna domena i adresy organizacji.</p><label><span>*. </span><input defaultValue="rachuno.pl" /></label></div></article><article className="owner-card admin-settings-card"><ShieldCheck size={23} /><div><h3>Polityka supervisorów</h3><p>Wymagaj uzasadnienia przed wejściem do organizacji.</p><input type="checkbox" defaultChecked /></div></article></div>;
}
