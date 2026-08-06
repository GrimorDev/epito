"use client";

import { ChangeEvent, Dispatch, SetStateAction, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileText,
  Folder,
  FolderPlus,
  Globe2,
  KeyRound,
  Mail,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";

export type WorkspaceDocument = {
  id: number;
  name: string;
  meta: string;
  status: string;
  type: string;
  year: number;
  month: string;
  category: string;
  amount?: string;
  pages?: number;
};

type DocumentsProps = {
  documents: WorkspaceDocument[];
  setDocuments: Dispatch<SetStateAction<WorkspaceDocument[]>>;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
};

const months = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];

export function DocumentsWorkspace({ documents, setDocuments, onUpload }: DocumentsProps) {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState("Lipiec");
  const [category, setCategory] = useState("Wszystkie");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(documents[0]?.id ?? null);
  const [previewId, setPreviewId] = useState<number | null>(documents[0]?.id ?? null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [folders, setFolders] = useState(["Sprzedaż", "Koszty", "Bank", "Umowy"]);
  const [newFolder, setNewFolder] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);

  const filtered = useMemo(() => documents.filter((document) => {
    const periodMatch = document.year === year && document.month === month;
    const categoryMatch = category === "Wszystkie" || document.category === category;
    const queryMatch = document.name.toLowerCase().includes(query.toLowerCase());
    return periodMatch && categoryMatch && queryMatch;
  }), [documents, year, month, category, query]);

  const preview = documents.find((document) => document.id === previewId) ?? null;

  function removeDocument(id: number) {
    setDocuments((current) => current.filter((document) => document.id !== id));
    if (previewId === id) setPreviewId(null);
    if (expandedId === id) setExpandedId(null);
  }

  function beginEdit(document: WorkspaceDocument) {
    setEditingId(document.id);
    setDraftName(document.name);
  }

  function saveEdit() {
    if (!editingId || !draftName.trim()) return;
    setDocuments((current) => current.map((document) => document.id === editingId ? { ...document, name: draftName.trim() } : document));
    setEditingId(null);
  }

  function addFolder() {
    const name = newFolder.trim();
    if (!name || folders.includes(name)) return;
    setFolders((current) => [...current, name]);
    setCategory(name);
    setNewFolder("");
    setAddingFolder(false);
  }

  return (
    <section className="subpage document-system-page">
      <div className="page-heading">
        <div><p>Centrum dokumentów</p><h1>Dokumenty</h1><span>Porządkuj, przeglądaj i edytuj pliki bez opuszczania panelu.</span></div>
        <label className="upload-button"><Upload size={18} /> Dodaj dokument<input type="file" onChange={onUpload} /></label>
      </div>

      <div className="document-periods">
        <div className="year-tabs" aria-label="Wybierz rok">
          {[2026, 2025, 2024].map((item) => <button key={item} className={year === item ? "active" : ""} onClick={() => setYear(item)}>{item}</button>)}
        </div>
        <div className="month-tabs" aria-label="Wybierz miesiąc">
          {months.map((item) => <button key={item} className={month === item ? "active" : ""} onClick={() => setMonth(item)}>{item.slice(0, 3)}</button>)}
        </div>
      </div>

      <div className="document-layout">
        <aside className="folder-sidebar">
          <div className="folder-heading"><span>FOLDERY</span><button onClick={() => setAddingFolder(true)} aria-label="Dodaj folder"><FolderPlus size={18} /></button></div>
          <button className={category === "Wszystkie" ? "active" : ""} onClick={() => setCategory("Wszystkie")}><Folder size={18} /><span>Wszystkie</span><b>{documents.filter((item) => item.year === year && item.month === month).length}</b></button>
          {folders.map((folder) => (
            <button key={folder} className={category === folder ? "active" : ""} onClick={() => setCategory(folder)}><Folder size={18} /><span>{folder}</span><b>{documents.filter((item) => item.year === year && item.month === month && item.category === folder).length}</b></button>
          ))}
          <AnimatePresence>
            {addingFolder && (
              <motion.div className="new-folder-form" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                <input value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder="Nazwa folderu" autoFocus />
                <button onClick={addFolder} aria-label="Zapisz folder"><Check size={16} /></button>
                <button onClick={() => setAddingFolder(false)} aria-label="Anuluj"><X size={16} /></button>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="storage-box"><span>Wykorzystane miejsce</span><strong>1,8 GB z 10 GB</strong><div><i style={{ width: "18%" }} /></div></div>
        </aside>

        <div className="document-browser panel-card">
          <div className="document-browser-toolbar">
            <div><h3>{category}</h3><p>{month} {year}, {filtered.length} dokumenty</p></div>
            <label className="document-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Szukaj dokumentu" /></label>
          </div>

          <div className="document-column-head"><span>Nazwa</span><span>Folder</span><span>Status</span><span>Kwota</span><span /></div>
          <div className="expandable-documents">
            {filtered.map((document) => (
              <div className={previewId === document.id ? "document-row-group selected" : "document-row-group"} key={document.id}>
                <div className="expandable-document-row">
                  <button className="expand-document" onClick={() => setExpandedId(expandedId === document.id ? null : document.id)} aria-label="Rozwiń szczegóły">
                    {expandedId === document.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <span className="file-tile"><FileText size={19} /><small>{document.type}</small></span>
                  <div className="document-name">
                    {editingId === document.id ? <div className="inline-edit"><input value={draftName} onChange={(event) => setDraftName(event.target.value)} autoFocus /><button onClick={saveEdit}><Check size={16} /></button><button onClick={() => setEditingId(null)}><X size={16} /></button></div> : <><strong>{document.name}</strong><small>{document.meta}</small></>}
                  </div>
                  <span className="document-category">{document.category}</span>
                  <span className={document.status === "Przetworzone" ? "doc-status done" : document.status === "Do uzupełnienia" ? "doc-status missing" : "doc-status pending"}>{document.status}</span>
                  <strong className="document-amount">{document.amount ?? "Brak"}</strong>
                  <button className="row-menu" aria-label="Więcej opcji"><MoreHorizontal size={20} /></button>
                </div>
                <AnimatePresence initial={false}>
                  {expandedId === document.id && (
                    <motion.div className="document-inline-details" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                      <div><small>Data dodania</small><strong>{document.meta.split(", ")[1] ?? "Dzisiaj"}</strong></div>
                      <div><small>Liczba stron</small><strong>{document.pages ?? 1}</strong></div>
                      <div><small>Okres</small><strong>{document.month} {document.year}</strong></div>
                      <div className="document-actions">
                        <button onClick={() => setPreviewId(document.id)}><Eye size={16} /> Podgląd</button>
                        <button onClick={() => beginEdit(document)}><Pencil size={16} /> Edytuj</button>
                        <button><Download size={16} /> Pobierz</button>
                        <button className="danger" onClick={() => removeDocument(document.id)}><Trash2 size={16} /> Usuń</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
            {filtered.length === 0 && <div className="empty-documents"><Folder size={32} /><strong>Ten folder jest pusty</strong><p>Dodaj dokument albo wybierz inny miesiąc.</p></div>}
          </div>
        </div>

        <aside className="document-preview-panel">
          {preview ? (
            <>
              <div className="preview-panel-head"><div><small>PODGLĄD</small><strong>{preview.name}</strong></div><button onClick={() => setPreviewId(null)} aria-label="Zamknij podgląd"><X size={20} /></button></div>
              <div className="pdf-preview">
                <div className="pdf-paper">
                  <div className="pdf-brand-line"><span>FAKTURA</span><b>{preview.amount ?? "Dokument"}</b></div>
                  <i className="pdf-line wide" /><i className="pdf-line medium" />
                  <div className="pdf-columns"><span><i /><i /><i /></span><span><i /><i /></span></div>
                  <div className="pdf-table-mock"><i /><i /><i /><i /></div>
                  <div className="pdf-total"><span /><strong /></div>
                </div>
                <span>Strona 1 z {preview.pages ?? 1}</span>
              </div>
              <div className="preview-metadata">
                <div><span>Folder</span><strong>{preview.category}</strong></div>
                <div><span>Okres</span><strong>{preview.month} {preview.year}</strong></div>
                <div><span>Status</span><strong>{preview.status}</strong></div>
                <div><span>Kwota</span><strong>{preview.amount ?? "Nie dotyczy"}</strong></div>
              </div>
              <div className="preview-actions"><button><Download size={17} /> Pobierz</button><button onClick={() => beginEdit(preview)}><Pencil size={17} /> Edytuj</button></div>
            </>
          ) : <div className="preview-empty"><Eye size={28} /><strong>Wybierz dokument</strong><p>Podgląd pojawi się tutaj bez otwierania nowej karty.</p></div>}
        </aside>
      </div>
    </section>
  );
}

type TeamMember = { id: number; name: string; email: string; role: string; status: string; initials: string };

const initialTeam: TeamMember[] = [
  { id: 1, name: "Marcin Kowalski", email: "marcin@kowalski-studio.pl", role: "Administrator", status: "Aktywny", initials: "MK" },
  { id: 2, name: "Katarzyna Lis", email: "katarzyna@kowalski-studio.pl", role: "Finanse", status: "Aktywny", initials: "KL" },
  { id: 3, name: "Paweł Wójcik", email: "pawel@kowalski-studio.pl", role: "Dokumenty", status: "Zaproszony", initials: "PW" },
];

export function TeamWorkspace() {
  const [team, setTeam] = useState(initialTeam);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Dokumenty");

  function inviteMember() {
    if (!name.trim() || !email.trim()) return;
    setTeam((current) => [...current, { id: Date.now(), name: name.trim(), email: email.trim(), role, status: "Zaproszony", initials: name.split(" ").map((item) => item[0]).join("").slice(0, 2).toUpperCase() }]);
    setName("");
    setEmail("");
    setInviteOpen(false);
  }

  return (
    <section className="subpage team-page">
      <div className="page-heading"><div><p>Użytkownicy firmy</p><h1>Zespół i uprawnienia</h1><span>Administrator biura zaprasza pracowników i określa ich dostęp.</span></div><button className="upload-button" onClick={() => setInviteOpen(true)}><UserPlus size={18} /> Zaproś pracownika</button></div>
      <div className="role-overview">
        <article><ShieldCheck size={23} /><div><small>ADMINISTRATORZY</small><strong>1 osoba</strong></div></article>
        <article><Users size={23} /><div><small>AKTYWNI PRACOWNICY</small><strong>{team.filter((item) => item.status === "Aktywny").length} osoby</strong></div></article>
        <article><Mail size={23} /><div><small>OCZEKUJĄCE ZAPROSZENIA</small><strong>{team.filter((item) => item.status === "Zaproszony").length} osoba</strong></div></article>
      </div>
      <div className="panel-card team-table-card">
        <div className="panel-card-heading"><div><h3>Pracownicy Kowalski Studio</h3><p>Uprawnienia dotyczą tylko tej organizacji.</p></div><label className="document-search"><Search size={17} /><input placeholder="Szukaj pracownika" /></label></div>
        <div className="team-table-head"><span>Użytkownik</span><span>Rola</span><span>Status</span><span>Ostatnia aktywność</span><span /></div>
        <div className="team-table">
          {team.map((member) => (
            <div key={member.id}><span className="team-avatar">{member.initials}</span><div><strong>{member.name}</strong><small>{member.email}</small></div><select value={member.role} onChange={(event) => setTeam((current) => current.map((item) => item.id === member.id ? { ...item, role: event.target.value } : item))}><option>Administrator</option><option>Finanse</option><option>Dokumenty</option><option>Tylko odczyt</option></select><span className={member.status === "Aktywny" ? "member-status active" : "member-status invited"}>{member.status}</span><span className="last-seen">{member.status === "Aktywny" ? "Dzisiaj, 09:24" : "Nie zalogował się"}</span><button onClick={() => setTeam((current) => current.filter((item) => item.id !== member.id))} aria-label={`Usuń ${member.name}`}><Trash2 size={18} /></button></div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {inviteOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="invite-modal" initial={{ opacity: 0, scale: .96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }}><button className="modal-close" onClick={() => setInviteOpen(false)}><X size={22} /></button><span className="modal-kicker">NOWY UŻYTKOWNIK</span><h2>Zaproś pracownika</h2><p>Pracownik otrzyma wiadomość z bezpiecznym linkiem do utworzenia konta.</p><label>Imię i nazwisko<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Anna Nowak" /></label><label>Adres e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="anna@firma.pl" /></label><label>Rola<select value={role} onChange={(event) => setRole(event.target.value)}><option>Dokumenty</option><option>Finanse</option><option>Tylko odczyt</option><option>Administrator</option></select></label><button className="button button-primary button-wide" onClick={inviteMember}>Wyślij zaproszenie</button></motion.div></motion.div>}
      </AnimatePresence>
    </section>
  );
}

export function SettingsWorkspace() {
  const [saved, setSaved] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [paymentReminders, setPaymentReminders] = useState(true);

  function saveSettings() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  return (
    <section className="subpage settings-page">
      <div className="page-heading"><div><p>Konfiguracja organizacji</p><h1>Ustawienia konta</h1><span>Dane firmy, adres portalu, wygląd i bezpieczeństwo.</span></div><button className="upload-button" onClick={saveSettings}><Save size={18} /> Zapisz zmiany</button></div>
      <AnimatePresence>{saved && <motion.div className="settings-saved" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={18} /> Ustawienia zostały zapisane.</motion.div>}</AnimatePresence>
      <div className="settings-layout">
        <nav className="settings-nav"><button className="active"><Globe2 size={18} /> Organizacja</button><button><Palette size={18} /> Wygląd portalu</button><button><Bell size={18} /> Powiadomienia</button><button><KeyRound size={18} /> Bezpieczeństwo</button></nav>
        <div className="settings-content">
          <article className="settings-card"><div className="settings-card-head"><Globe2 size={21} /><div><h3>Dane organizacji</h3><p>Informacje widoczne w panelu pracowników.</p></div></div><div className="settings-form-grid"><label>Pełna nazwa firmy<input defaultValue="Kowalski Studio sp. z o.o." /></label><label>NIP<input defaultValue="525 293 18 42" /></label><label>E-mail rozliczeniowy<input defaultValue="finanse@kowalski-studio.pl" /></label><label>Telefon<input defaultValue="+48 22 123 45 67" /></label></div></article>
          <article className="settings-card"><div className="settings-card-head"><Globe2 size={21} /><div><h3>Adres portalu</h3><p>Dedykowany adres logowania dla Twojej firmy.</p></div></div><label className="domain-input"><span>https://</span><input defaultValue="client231" /><b>.rachuno.pl</b><button aria-label="Kopiuj adres"><Copy size={17} /></button></label><small className="field-help">Zmiana adresu wymaga ponownego zalogowania wszystkich użytkowników.</small></article>
          <article className="settings-card"><div className="settings-card-head"><Palette size={21} /><div><h3>Wygląd portalu</h3><p>Dopasuj panel do marki swojej firmy.</p></div></div><div className="branding-row"><button className="logo-upload"><Plus size={20} /><span>Dodaj logo</span></button><label>Kolor akcentu<div className="color-control"><input type="color" defaultValue="#caff65" /><input defaultValue="#CAFF65" /></div></label><label>Nazwa w nagłówku<input defaultValue="Kowalski Studio" /></label></div></article>
          <article className="settings-card"><div className="settings-card-head"><Bell size={21} /><div><h3>Powiadomienia</h3><p>Określ, jakie wiadomości otrzymuje zespół.</p></div></div><div className="toggle-list"><label><span><strong>Powiadomienia e-mail</strong><small>Nowe dokumenty i wiadomości od biura.</small></span><input type="checkbox" checked={emailNotifications} onChange={() => setEmailNotifications((value) => !value)} /></label><label><span><strong>Przypomnienia o płatnościach</strong><small>Wiadomość 3 dni przed terminem.</small></span><input type="checkbox" checked={paymentReminders} onChange={() => setPaymentReminders((value) => !value)} /></label></div></article>
          <article className="settings-card security-card"><div className="settings-card-head"><ShieldCheck size={21} /><div><h3>Bezpieczeństwo i nadzór</h3><p>Administrator organizacji kontroluje pracowników. Zespół Rachuno ma wyłącznie audytowany dostęp supervisorski.</p></div></div><div className="security-details"><span><Check size={17} /> Wymuszona weryfikacja dwuetapowa administratorów</span><span><Check size={17} /> Rejestr logowań i zmian uprawnień</span><span><Check size={17} /> Izolacja danych między organizacjami</span></div></article>
        </div>
      </div>
    </section>
  );
}
