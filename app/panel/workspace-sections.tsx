"use client";

import { ChangeEvent, Dispatch, FormEvent, SetStateAction, useEffect, useMemo, useState } from "react";
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
  Maximize2,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
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
  id: string | number;
  name: string;
  meta: string;
  status: string;
  type: string;
  year: number;
  month: string;
  category: string;
  amount?: string;
  pages?: number;
  mimeType?: string;
  fileSize?: number;
  categoryCode?: string;
  statusCode?: string;
  currency?: string;
  issuedAt?: string | null;
  analysis?: {
    state?: string;
    method?: "pdf_text" | "ocr";
    confidence?: number;
    amount_source?: string | null;
    reason?: string | null;
    page_count?: number;
  } | null;
  manualOverride?: boolean;
};

type DocumentsProps = {
  documents: WorkspaceDocument[];
  setDocuments: Dispatch<SetStateAction<WorkspaceDocument[]>>;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenImport?: () => void;
  onOpenIssueInvoice?: () => void;
  production?: boolean;
  onChanged?: () => Promise<void> | void;
  onNotice?: (message: string) => void;
};

const months = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
const categoryOptions = [
  ["sales", "Sprzedaż"], ["costs", "Koszty"], ["bank", "Bank"], ["contracts", "Umowy"], ["tax", "Podatki"], ["other", "Inne"],
] as const;

function DocumentViewer({ document, production, fullscreen = false }: { document: WorkspaceDocument; production: boolean; fullscreen?: boolean }) {
  if (!production) {
    return <div className="pdf-paper"><div className="pdf-brand-line"><span>FAKTURA</span><b>{document.amount ?? "Dokument"}</b></div><i className="pdf-line wide" /><i className="pdf-line medium" /><div className="pdf-columns"><span><i /><i /><i /></span><span><i /><i /></span></div><div className="pdf-table-mock"><i /><i /><i /><i /></div><div className="pdf-total"><span /><strong /></div></div>;
  }
  const source = `/api/workspace/documents/${document.id}?inline=1`;
  if (document.mimeType?.startsWith("image/")) return <img className="real-document-image" src={source} alt={`Podgląd ${document.name}`} />;
  return <iframe className={fullscreen ? "real-document-frame fullscreen" : "real-document-frame"} src={source} title={`Podgląd dokumentu ${document.name}`} />;
}

export function DocumentsWorkspace({ documents, setDocuments, onUpload, onOpenImport, onOpenIssueInvoice, production = false, onChanged, onNotice }: DocumentsProps) {
  const [year, setYear] = useState(() => documents[0]?.year || new Date().getFullYear());
  const [month, setMonth] = useState(() => documents[0]?.month || months[new Date().getMonth()]);
  const [category, setCategory] = useState("Wszystkie");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | number | null>(documents[0]?.id ?? null);
  const [previewId, setPreviewId] = useState<string | number | null>(documents[0]?.id ?? null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("other");
  const [draftAmount, setDraftAmount] = useState("");
  const [draftCurrency, setDraftCurrency] = useState("PLN");
  const [draftStatus, setDraftStatus] = useState("verified");
  const [draftIssuedAt, setDraftIssuedAt] = useState("");
  const [editPending, setEditPending] = useState(false);
  const [fullscreenId, setFullscreenId] = useState<string | number | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | number | null>(null);
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
  const fullscreenDocument = documents.find((document) => document.id === fullscreenId) ?? null;
  const editingDocument = documents.find((document) => document.id === editingId) ?? null;

  useEffect(() => {
    if (!fullscreenDocument && !editingDocument) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") { setFullscreenId(null); setEditingId(null); }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [fullscreenDocument, editingDocument]);

  async function removeDocument(id: string | number) {
    if (production) {
      const response = await fetch(`/api/workspace/documents/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        onNotice?.(payload.error || "Nie udało się usunąć dokumentu.");
        return;
      }
      await onChanged?.();
      onNotice?.("Dokument został przeniesiony do archiwum.");
    }
    setDocuments((current) => current.filter((document) => document.id !== id));
    if (previewId === id) setPreviewId(null);
    if (expandedId === id) setExpandedId(null);
  }

  function beginEdit(document: WorkspaceDocument) {
    setFullscreenId(null);
    setEditingId(document.id);
    setDraftName(document.name);
    setDraftCategory(document.categoryCode || categoryOptions.find(([, label]) => label === document.category)?.[0] || "other");
    setDraftAmount(document.amount ? document.amount.replace(/[^\d,-]/g, "").replace(",", ".") : "");
    setDraftCurrency(document.currency || "PLN");
    setDraftStatus(document.statusCode === "requires_action" || document.status === "Do uzupełnienia" || document.status === "Sprawdź dane" ? "requires_action" : "verified");
    setDraftIssuedAt(document.issuedAt || "");
  }

  async function saveEdit() {
    if (!editingId || !draftName.trim()) return;
    setEditPending(true);
    if (production) {
      const response = await fetch(`/api/workspace/documents/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: draftName.trim(), category: draftCategory, amount: draftAmount, currency: draftCurrency, status: draftStatus, issuedAt: draftIssuedAt }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        onNotice?.(payload.error || "Nie udało się zapisać danych dokumentu.");
        setEditPending(false);
        return;
      }
      await onChanged?.();
      onNotice?.("Dane dokumentu zostały zapisane.");
    }
    setDocuments((current) => current.map((document) => document.id === editingId ? { ...document, name: draftName.trim(), categoryCode: draftCategory, category: categoryOptions.find(([code]) => code === draftCategory)?.[1] || "Inne", amount: draftAmount ? `${Number(draftAmount).toLocaleString("pl-PL", { minimumFractionDigits: 2 })} ${draftCurrency}` : undefined, currency: draftCurrency, statusCode: draftStatus, status: draftStatus === "verified" ? (production ? "Odczytano" : "Przetworzone") : (production ? "Sprawdź dane" : "Do uzupełnienia"), issuedAt: draftIssuedAt || null, manualOverride: production } : document));
    setEditPending(false);
    setEditingId(null);
  }

  async function reanalyzeDocument(id: string | number) {
    setReanalyzingId(id);
    try {
      const response = await fetch(`/api/workspace/documents/${id}`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się uruchomić analizy.");
      await onChanged?.();
      onNotice?.("Dokument trafił do kolejki analizy. Wynik pojawi się automatycznie.");
    } catch (reason) {
      onNotice?.(reason instanceof Error ? reason.message : "Nie udało się uruchomić analizy.");
    } finally {
      setReanalyzingId(null);
    }
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
        <div className="page-heading-actions">
          {production && onOpenImport ? (
            <button className="upload-button" type="button" onClick={onOpenImport}><Upload size={18} /> Dodaj dokument</button>
          ) : (
            <label className="upload-button"><Upload size={18} /> Dodaj dokument<input type="file" onChange={onUpload} /></label>
          )}
          {production && onOpenIssueInvoice ? (
            <button className="button button-primary" type="button" onClick={onOpenIssueInvoice}><FileText size={18} /> Wystaw fakturę</button>
          ) : null}
        </div>
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
          <div className="folder-heading"><span>FOLDERY</span>{!production ? <button onClick={() => setAddingFolder(true)} aria-label="Dodaj folder"><FolderPlus size={18} /></button> : null}</div>
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
                    <><strong>{document.name}</strong><small>{document.meta}</small></>
                  </div>
                  <span className="document-category">{document.category}</span>
                  <span className={document.status === "Przetworzone" || document.status === "Odczytano" ? "doc-status done" : document.status === "Do uzupełnienia" || document.status === "Sprawdź dane" ? "doc-status missing" : "doc-status pending"}>{document.status}</span>
                  <strong className="document-amount">{document.amount ?? "Brak"}</strong>
                  {!production ? <button className="row-menu" aria-label="Więcej opcji"><MoreHorizontal size={20} /></button> : <span />}
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
                        {production ? <a className="document-download-link" href={`/api/workspace/documents/${document.id}`}><Download size={16} /> Pobierz</a> : <button><Download size={16} /> Pobierz</button>}
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
              <div className="pdf-preview"><DocumentViewer document={preview} production={production} /><span>{production ? "Oryginalny plik" : `Strona 1 z ${preview.pages ?? 1}`}</span></div>
              <div className="preview-metadata">
                <div><span>Folder</span><strong>{preview.category}</strong></div>
                <div><span>Okres</span><strong>{preview.month} {preview.year}</strong></div>
                <div><span>Status</span><strong>{preview.status}</strong></div>
                <div><span>Kwota</span><strong>{preview.amount ?? "Nie dotyczy"}</strong></div>
              </div>
              {preview.manualOverride ? <div className="analysis-note"><strong>Dane poprawione ręcznie</strong><span>Kwota, status lub data zostały zatwierdzone przez użytkownika i mają pierwszeństwo przed OCR.</span></div> : preview.analysis ? <div className="analysis-note"><strong>{preview.analysis.method === "ocr" ? "Odczyt OCR" : "Tekst z PDF"}{typeof preview.analysis.confidence === "number" && preview.analysis.confidence > 0 ? ` · ${Math.round(preview.analysis.confidence * 100)}% pewności` : ""}</strong><span>{preview.analysis.reason || (preview.analysis.amount_source ? `Kwota znaleziona przy polu „${preview.analysis.amount_source}”.` : "Dane dokumentu zostały przeanalizowane.")}</span></div> : <div className="analysis-note"><strong>{preview.statusCode === "processing" || preview.statusCode === "uploaded" ? "Analiza trwa" : "Brak analizy"}</strong><span>{preview.statusCode === "processing" || preview.statusCode === "uploaded" ? "Worker odczytuje tekst i kwotę. Widok odświeży się automatycznie po zakończeniu." : "Kwotę i metadane możesz uzupełnić ręcznie."}</span></div>}
              {production && !preview.manualOverride && preview.statusCode !== "processing" ? <button className="reanalyze-document" onClick={() => void reanalyzeDocument(preview.id)} disabled={reanalyzingId === preview.id}><RefreshCw size={16} className={reanalyzingId === preview.id ? "spinning" : ""} />{reanalyzingId === preview.id ? "Dodawanie do kolejki" : "Analizuj ponownie"}</button> : null}
              <div className="preview-actions"><button onClick={() => setFullscreenId(preview.id)}><Maximize2 size={17} /> Pełny ekran</button>{production ? <a className="document-download-link" href={`/api/workspace/documents/${preview.id}`}><Download size={17} /> Pobierz</a> : <button><Download size={17} /> Pobierz</button>}{production && preview.mimeType?.includes("xml") ? <a className="document-download-link" href={`/api/workspace/documents/${preview.id}?format=pdf`}><Download size={17} /> Pobierz PDF</a> : null}<button onClick={() => beginEdit(preview)}><Pencil size={17} /> Dane</button></div>
            </>
          ) : <div className="preview-empty"><Eye size={28} /><strong>Wybierz dokument</strong><p>Podgląd pojawi się tutaj bez otwierania nowej karty.</p></div>}
        </aside>
      </div>

      <AnimatePresence>
        {fullscreenDocument ? <motion.div className="document-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Pełny podgląd ${fullscreenDocument.name}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="document-fullscreen-modal" initial={{ scale: .98, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .98, y: 10 }}><header><div><small>ORYGINALNY DOKUMENT</small><strong>{fullscreenDocument.name}</strong></div><div>{production ? <a href={`/api/workspace/documents/${fullscreenDocument.id}`}><Download size={18} /> Pobierz</a> : null}<button onClick={() => beginEdit(fullscreenDocument)}><Pencil size={18} /> Dane</button><button className="icon-only" onClick={() => setFullscreenId(null)} aria-label="Zamknij pełny podgląd"><X size={22} /></button></div></header><div className="document-fullscreen-canvas"><DocumentViewer document={fullscreenDocument} production={production} fullscreen /></div></motion.div></motion.div> : null}
      </AnimatePresence>

      <AnimatePresence>
        {editingDocument ? <motion.div className="document-modal-backdrop" role="dialog" aria-modal="true" aria-label="Edycja danych dokumentu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.form className="document-editor-modal" onSubmit={(event) => { event.preventDefault(); void saveEdit(); }} initial={{ scale: .97, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .97, y: 12 }}><button className="modal-close" type="button" onClick={() => setEditingId(null)} aria-label="Zamknij edycję"><X size={22} /></button><span className="modal-kicker">DANE DOKUMENTU</span><h2>Sprawdź i popraw odczyt</h2><p>Automatyczny odczyt jest pomocą. Zapis ręczny ma pierwszeństwo i trafia do rejestru zmian.</p><label>Nazwa pliku<input value={draftName} onChange={(event) => setDraftName(event.target.value)} required maxLength={240} /></label><div className="document-editor-grid"><label>Folder<select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)}>{categoryOptions.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label><label>Status<select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)}><option value="verified">Sprawdzony</option><option value="requires_action">Wymaga uzupełnienia</option></select></label><label>Kwota brutto<input inputMode="decimal" value={draftAmount} onChange={(event) => setDraftAmount(event.target.value)} placeholder="0,00" /></label><label>Waluta<select value={draftCurrency} onChange={(event) => setDraftCurrency(event.target.value)}><option>PLN</option><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option></select></label><label>Data wystawienia<input type="date" value={draftIssuedAt} onChange={(event) => setDraftIssuedAt(event.target.value)} /></label></div><button className="button button-primary button-wide" type="submit" disabled={editPending}>{editPending ? "Zapisywanie" : "Zapisz dane dokumentu"}</button></motion.form></motion.div> : null}
      </AnimatePresence>
    </section>
  );
}

export function DocumentImportModal({
  companies,
  onClose,
  onImported,
}: {
  companies: Array<{ id: string; name: string }>;
  onClose: () => void;
  onImported: (message: string) => void;
}) {
  const [mode, setMode] = useState<"single" | "jpk_fa">("single");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const endpoint = mode === "jpk_fa" ? "/api/workspace/documents/jpk-fa" : "/api/workspace/documents";
    try {
      const response = await fetch(endpoint, { method: "POST", body: new FormData(event.currentTarget) });
      const payload = (await response.json()) as { error?: string; imported?: number; skipped?: number };
      if (!response.ok) throw new Error(payload.error || "Nie udało się przesłać pliku.");
      onImported(
        mode === "jpk_fa"
          ? `Faktury zostały zaimportowane: ${payload.imported ?? 0}${payload.skipped ? ` (pominięto ${payload.skipped} już istniejących)` : ""}.`
          : "Dokument został zapisany. Trwa odczyt kwoty i danych faktury.",
      );
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się przesłać pliku.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div className="document-modal-backdrop" role="dialog" aria-modal="true" aria-label="Dodaj dokument" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.form className="document-editor-modal" onSubmit={handleSubmit} initial={{ scale: 0.97, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 12 }}>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Zamknij"><X size={22} /></button>
          <span className="modal-kicker">DOKUMENTY</span>
          <h2>Dodaj dokument</h2>
          <div className="import-mode-toggle">
            <button type="button" className={mode === "single" ? "active" : ""} onClick={() => setMode("single")}>Zwykły dokument</button>
            <button type="button" className={mode === "jpk_fa" ? "active" : ""} onClick={() => setMode("jpk_fa")}>Import JPK_FA</button>
          </div>
          <label>
            Klient
            <select name="clientCompanyId" required defaultValue="">
              <option value="" disabled>Wybierz firmę</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>
          {mode === "single" ? (
            <label>Plik (PDF, JPG, PNG, CSV, XML)<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.csv,.xml" required /></label>
          ) : (
            <label>Plik JPK_FA (XML) — z Comarch, Insert, Symfonii lub innego programu księgowego<input name="file" type="file" accept=".xml,text/xml,application/xml" required /></label>
          )}
          {error ? <p className="form-error">{error}</p> : null}
          {!companies.length ? <p className="form-error">Najpierw dodaj klienta w zakładce Klienci.</p> : null}
          <button className="button button-primary button-wide" type="submit" disabled={pending || !companies.length}>
            {pending ? "Wysyłanie…" : mode === "jpk_fa" ? "Zaimportuj" : "Dodaj dokument"}
          </button>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

type InvoiceLineDraft = { name: string; unit: string; quantity: string; netUnitPrice: string; vatRate: "23" | "8" | "5" | "0" | "zw" };
type Counterparty = { id: string; name: string; nip: string | null; address: string | null; email: string | null };

const VAT_RATE_OPTIONS: Array<["23" | "8" | "5" | "0" | "zw", string]> = [
  ["23", "23%"], ["8", "8%"], ["5", "5%"], ["0", "0%"], ["zw", "zw."],
];

function emptyInvoiceLine(): InvoiceLineDraft {
  return { name: "", unit: "szt.", quantity: "1", netUnitPrice: "", vatRate: "23" };
}

export function IssueInvoiceModal({
  companies,
  onClose,
  onIssued,
}: {
  companies: Array<{ id: string; name: string }>;
  onClose: () => void;
  onIssued: (message: string) => void;
}) {
  const [clientCompanyId, setClientCompanyId] = useState("");
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [addingCounterparty, setAddingCounterparty] = useState(false);
  const [newCounterpartyName, setNewCounterpartyName] = useState("");
  const [newCounterpartyNip, setNewCounterpartyNip] = useState("");
  const [newCounterpartyAddress, setNewCounterpartyAddress] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [lines, setLines] = useState<InvoiceLineDraft[]>([emptyInvoiceLine()]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!clientCompanyId) return;
    let cancelled = false;
    fetch(`/api/workspace/counterparties?clientCompanyId=${encodeURIComponent(clientCompanyId)}`)
      .then((response) => (response.ok ? response.json() : { counterparties: [] }))
      .then((payload: { counterparties?: Counterparty[] }) => {
        if (!cancelled) setCounterparties(payload.counterparties || []);
      })
      .catch(() => { if (!cancelled) setCounterparties([]); });
    return () => { cancelled = true; };
  }, [clientCompanyId]);

  function handleClientCompanyChange(nextClientCompanyId: string) {
    setClientCompanyId(nextClientCompanyId);
    setCounterpartyId("");
    setAddingCounterparty(false);
    setCounterparties([]);
  }

  const grossTotal = lines.reduce((sum, line) => {
    const net = (Number(line.quantity) || 0) * (Number(line.netUnitPrice) || 0);
    const vat = line.vatRate === "0" || line.vatRate === "zw" ? 0 : net * (Number(line.vatRate) / 100);
    return sum + net + vat;
  }, 0);

  function updateLine(index: number, patch: Partial<InvoiceLineDraft>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const parsedLines = lines.map((line) => ({
        name: line.name.trim(),
        unit: line.unit.trim(),
        quantity: Number(line.quantity),
        netUnitPrice: Number(line.netUnitPrice),
        vatRate: line.vatRate,
      }));
      if (parsedLines.some((line) => !line.name || !line.unit || !(line.quantity > 0) || !(line.netUnitPrice >= 0))) {
        throw new Error("Uzupełnij poprawnie wszystkie pozycje faktury.");
      }

      const body: Record<string, unknown> = {
        clientCompanyId,
        issuedAt,
        dueDate: dueDate || null,
        companyAddress: companyAddress.trim() || undefined,
        bankAccountNumber: bankAccountNumber.trim() || undefined,
        lines: parsedLines,
      };
      if (addingCounterparty) {
        body.counterparty = { name: newCounterpartyName.trim(), nip: newCounterpartyNip.trim(), address: newCounterpartyAddress.trim() };
      } else {
        body.counterpartyId = counterpartyId;
      }

      const response = await fetch("/api/workspace/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string; invoiceNumber?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się wystawić faktury.");
      onIssued(`Faktura ${payload.invoiceNumber} została zapisana i wysłana do KSeF. Numer KSeF pojawi się po potwierdzeniu.`);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się wystawić faktury.");
    } finally {
      setPending(false);
    }
  }

  const canSubmit = clientCompanyId && (addingCounterparty ? newCounterpartyName.trim() : counterpartyId) && lines.length > 0;

  return (
    <AnimatePresence>
      <motion.div className="document-modal-backdrop" role="dialog" aria-modal="true" aria-label="Wystaw fakturę" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <motion.form className="document-editor-modal invoice-issue-modal" onSubmit={handleSubmit} initial={{ scale: 0.97, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.97, y: 12 }}>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Zamknij"><X size={22} /></button>
          <span className="modal-kicker">FAKTURY</span>
          <h2>Wystaw fakturę</h2>
          <p>Faktura zostanie wysłana do KSeF jako faktura sprzedaży VAT.</p>

          <label>
            Klient (sprzedawca)
            <select value={clientCompanyId} onChange={(event) => handleClientCompanyChange(event.target.value)} required>
              <option value="" disabled>Wybierz firmę</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </label>

          <label>Adres firmy klienta (tylko jeśli jeszcze nie uzupełniony w profilu)<input value={companyAddress} onChange={(event) => setCompanyAddress(event.target.value)} placeholder="ul. Przykładowa 1, 00-000 Warszawa" /></label>

          {!addingCounterparty ? (
            <label>
              Nabywca
              <select value={counterpartyId} onChange={(event) => setCounterpartyId(event.target.value)} disabled={!clientCompanyId}>
                <option value="" disabled>Wybierz kontrahenta</option>
                {counterparties.map((party) => <option key={party.id} value={party.id}>{party.name}{party.nip ? ` (NIP ${party.nip})` : ""}</option>)}
              </select>
              <button type="button" className="link-button" onClick={() => setAddingCounterparty(true)}>+ Dodaj nowego kontrahenta</button>
            </label>
          ) : (
            <div className="invoice-new-counterparty">
              <label>Nazwa nabywcy<input value={newCounterpartyName} onChange={(event) => setNewCounterpartyName(event.target.value)} required /></label>
              <label>NIP (opcjonalnie)<input value={newCounterpartyNip} onChange={(event) => setNewCounterpartyNip(event.target.value)} placeholder="10 cyfr" /></label>
              <label>Adres<input value={newCounterpartyAddress} onChange={(event) => setNewCounterpartyAddress(event.target.value)} /></label>
              <button type="button" className="link-button" onClick={() => setAddingCounterparty(false)}>Wybierz z listy zamiast tego</button>
            </div>
          )}

          <div className="document-editor-grid">
            <label>Data wystawienia<input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} required /></label>
            <label>Termin płatności<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <label>Numer konta do zapłaty<input value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value)} placeholder="26 cyfr" /></label>
          </div>

          <div className="invoice-lines">
            <span className="modal-kicker">POZYCJE</span>
            {lines.map((line, index) => (
              <div className="invoice-line-row" key={index}>
                <input placeholder="Nazwa usługi/towaru" value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} required />
                <input placeholder="Ilość" inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} required />
                <input placeholder="J.m." value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} required />
                <input placeholder="Cena netto" inputMode="decimal" value={line.netUnitPrice} onChange={(event) => updateLine(index, { netUnitPrice: event.target.value })} required />
                <select value={line.vatRate} onChange={(event) => updateLine(index, { vatRate: event.target.value as InvoiceLineDraft["vatRate"] })}>
                  {VAT_RATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" className="icon-only" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} disabled={lines.length === 1} aria-label="Usuń pozycję"><X size={16} /></button>
              </div>
            ))}
            <button type="button" className="link-button" onClick={() => setLines((current) => [...current, emptyInvoiceLine()])}>+ Dodaj pozycję</button>
          </div>

          <div className="invoice-total-preview">Do zapłaty (brutto): <strong>{grossTotal.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PLN</strong></div>

          {error ? <p className="form-error">{error}</p> : null}
          <button className="button button-primary button-wide" type="submit" disabled={pending || !canSubmit}>
            {pending ? "Wystawianie…" : "Wystaw i wyślij do KSeF"}
          </button>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

export type TeamMember = { id: string | number; name: string; email: string; role: string; status: string; initials: string };

const initialTeam: TeamMember[] = [
  { id: 1, name: "Marcin Kowalski", email: "marcin@kowalski-studio.pl", role: "admin", status: "Aktywny", initials: "MK" },
  { id: 2, name: "Katarzyna Lis", email: "katarzyna@kowalski-studio.pl", role: "accountant", status: "Aktywny", initials: "KL" },
  { id: 3, name: "Paweł Wójcik", email: "pawel@kowalski-studio.pl", role: "employee", status: "Zaproszony", initials: "PW" },
];

type TeamWorkspaceProps = {
  initialMembers?: TeamMember[];
  organizationName?: string;
  production?: boolean;
  onChanged?: () => Promise<void> | void;
};

export function TeamWorkspace({ initialMembers, organizationName = "Kowalski Studio", production = false, onChanged }: TeamWorkspaceProps = {}) {
  const [team, setTeam] = useState(initialMembers ?? initialTeam);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [password, setPassword] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rolePending, setRolePending] = useState<string | number | null>(null);
  const visibleTeam = production && initialMembers ? initialMembers : team;
  const filteredTeam = visibleTeam.filter((member) => `${member.name} ${member.email}`.toLocaleLowerCase("pl").includes(teamQuery.toLocaleLowerCase("pl")));

  async function inviteMember() {
    if (!name.trim() || !email.trim()) return;
    setError("");
    if (production) {
      setPending(true);
      try {
        const response = await fetch("/api/workspace/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: name, email, role, password }) });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Nie udało się utworzyć konta.");
        await onChanged?.();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Nie udało się utworzyć konta.");
        setPending(false);
        return;
      }
      setPending(false);
    } else {
      setTeam((current) => [...current, { id: Date.now(), name: name.trim(), email: email.trim(), role, status: "Zaproszony", initials: name.split(" ").map((item) => item[0]).join("").slice(0, 2).toUpperCase() }]);
    }
    setName("");
    setEmail("");
    setPassword("");
    setInviteOpen(false);
  }

  async function changeMemberRole(member: TeamMember, nextRole: string) {
    if (!production) {
      setTeam((current) => current.map((item) => item.id === member.id ? { ...item, role: nextRole } : item));
      return;
    }
    setError("");
    setRolePending(member.id);
    try {
      const response = await fetch("/api/workspace/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.id, role: nextRole }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zmienić roli.");
      await onChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się zmienić roli.");
    } finally {
      setRolePending(null);
    }
  }

  return (
    <section className="subpage team-page">
      <div className="page-heading"><div><p>Użytkownicy firmy</p><h1>Zespół i uprawnienia</h1><span>Administrator biura zaprasza pracowników i określa ich dostęp.</span></div><button className="upload-button" onClick={() => setInviteOpen(true)}><UserPlus size={18} /> Zaproś pracownika</button></div>
      <div className="role-overview">
        <article><ShieldCheck size={23} /><div><small>ADMINISTRATORZY</small><strong>{visibleTeam.filter((item) => item.role === "owner" || item.role === "admin").length} osoba</strong></div></article>
        <article><Users size={23} /><div><small>AKTYWNI PRACOWNICY</small><strong>{visibleTeam.filter((item) => item.status === "Aktywny").length} osoby</strong></div></article>
        <article><Mail size={23} /><div><small>OCZEKUJĄCE ZAPROSZENIA</small><strong>{visibleTeam.filter((item) => item.status === "Zaproszony").length} osoba</strong></div></article>
      </div>
      <div className="panel-card team-table-card">
        {error && !inviteOpen ? <div className="team-notice">{error}</div> : null}
        <div className="panel-card-heading"><div><h3>Pracownicy {organizationName}</h3><p>Uprawnienia dotyczą tylko tej organizacji.</p></div><label className="document-search"><Search size={17} /><input value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} placeholder="Szukaj pracownika" /></label></div>
        <div className="team-table-head"><span>Użytkownik</span><span>Rola</span><span>Status</span><span>Ostatnia aktywność</span><span /></div>
        <div className="team-table">
          {filteredTeam.map((member) => (
            <div key={member.id}><span className="team-avatar">{member.initials}</span><div><strong>{member.name}</strong><small>{member.email}</small></div>{member.role === "owner" ? <strong className="team-role-label">Właściciel</strong> : <select value={member.role} onChange={(event) => void changeMemberRole(member, event.target.value)} disabled={rolePending === member.id}><option value="admin">Administrator</option><option value="accountant">Księgowość</option><option value="employee">Dokumenty</option><option value="viewer">Tylko odczyt</option></select>}<span className={member.status === "Aktywny" ? "member-status active" : "member-status invited"}>{member.status}</span><span className="last-seen">{member.status === "Aktywny" ? "Aktywne konto" : "Nie zalogował się"}</span>{!production ? <button onClick={() => setTeam((current) => current.filter((item) => item.id !== member.id))} aria-label={`Usuń ${member.name}`}><Trash2 size={18} /></button> : <span />}</div>
          ))}
          {filteredTeam.length === 0 ? <div className="team-empty">Nie znaleziono pracownika.</div> : null}
        </div>
      </div>

      <AnimatePresence>
        {inviteOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.div className="invite-modal" initial={{ opacity: 0, scale: .96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }}><button className="modal-close" onClick={() => setInviteOpen(false)}><X size={22} /></button><span className="modal-kicker">NOWY UŻYTKOWNIK</span><h2>{production ? "Utwórz konto pracownika" : "Zaproś pracownika"}</h2><p>{production ? "Pracownik zaloguje się podanym adresem e-mail i hasłem startowym." : "Pracownik otrzyma wiadomość z bezpiecznym linkiem do utworzenia konta."}</p><label>Imię i nazwisko<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Anna Nowak" /></label><label>Adres e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="anna@firma.pl" /></label><label>Rola<select value={role} onChange={(event) => setRole(event.target.value)}><option value="employee">Dokumenty</option><option value="accountant">Księgowość</option><option value="viewer">Tylko odczyt</option><option value="admin">Administrator</option></select></label>{production ? <label>Hasło startowe<input type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label> : null}{error ? <div className="demo-notice">{error}</div> : null}<button className="button button-primary button-wide" onClick={inviteMember} disabled={pending}>{pending ? "Tworzenie konta" : production ? "Utwórz konto" : "Wyślij zaproszenie"}</button></motion.div></motion.div>}
      </AnimatePresence>
    </section>
  );
}

type SettingsWorkspaceProps = {
  production?: boolean;
  organization?: {
    displayName: string;
    legalName: string;
    nip: string | null;
    slug: string;
    settings?: {
      branding?: { accentColor?: string; headerName?: string; logoKey?: string };
      notifications?: { email?: boolean; paymentReminders?: boolean };
    };
  };
  onChanged?: () => Promise<void> | void;
};

export function SettingsWorkspace({ production = false, organization, onChanged }: SettingsWorkspaceProps = {}) {
  const [activeTab, setActiveTab] = useState<"organization" | "appearance" | "notifications" | "security">("organization");
  const [saved, setSaved] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(organization?.settings?.notifications?.email ?? true);
  const [paymentReminders, setPaymentReminders] = useState(organization?.settings?.notifications?.paymentReminders ?? true);
  const [displayName, setDisplayName] = useState(organization?.displayName || "Kowalski Studio");
  const [legalName, setLegalName] = useState(organization?.legalName || "Kowalski Studio sp. z o.o.");
  const [nip, setNip] = useState(organization?.nip || "525 293 18 42");
  const [headerName, setHeaderName] = useState(organization?.settings?.branding?.headerName || organization?.displayName || "Kowalski Studio");
  const [accentColor, setAccentColor] = useState(organization?.settings?.branding?.accentColor || "#CAFF65");
  const [logoVersion, setLogoVersion] = useState(() => Date.now());
  const [logoUploading, setLogoUploading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function saveSettings() {
    setError("");
    if (production) {
      setPending(true);
      try {
        const response = await fetch("/api/workspace/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName, legalName, nip, headerName, accentColor, emailNotifications, paymentReminders }) });
        const payload = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(payload.error || "Nie udało się zapisać ustawień.");
        await onChanged?.();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Nie udało się zapisać ustawień.");
        setPending(false);
        return;
      }
      setPending(false);
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  }

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!production) { setLogoVersion(Date.now()); return; }
    setLogoUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.set("logo", file);
      const response = await fetch("/api/workspace/settings/logo", { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zapisać logo.");
      setLogoVersion(Date.now());
      await onChanged?.();
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się zapisać logo.");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!production) { setSaved(true); return; }
    setPasswordPending(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Nie udało się zmienić hasła.");
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się zmienić hasła.");
    } finally {
      setPasswordPending(false);
    }
  }

  async function copyPortalAddress() {
    const address = `https://${organization?.slug || "client231"}.epito.pl`;
    await navigator.clipboard.writeText(address);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  }

  return (
    <section className="subpage settings-page">
      <div className="page-heading"><div><p>Konfiguracja organizacji</p><h1>Ustawienia konta</h1><span>Dane firmy, adres portalu, wygląd i bezpieczeństwo.</span></div><button className="upload-button" onClick={saveSettings} disabled={pending}><Save size={18} /> {pending ? "Zapisywanie" : "Zapisz zmiany"}</button></div>
      <AnimatePresence>{saved && <motion.div className="settings-saved" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={18} /> Ustawienia zostały zapisane.</motion.div>}</AnimatePresence>
      {error ? <div className="settings-saved">{error}</div> : null}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Sekcje ustawień"><button className={activeTab === "organization" ? "active" : ""} onClick={() => setActiveTab("organization")}><Globe2 size={18} /> Organizacja</button><button className={activeTab === "appearance" ? "active" : ""} onClick={() => setActiveTab("appearance")}><Palette size={18} /> Wygląd portalu</button><button className={activeTab === "notifications" ? "active" : ""} onClick={() => setActiveTab("notifications")}><Bell size={18} /> Powiadomienia</button><button className={activeTab === "security" ? "active" : ""} onClick={() => setActiveTab("security")}><KeyRound size={18} /> Bezpieczeństwo</button></nav>
        <div className="settings-content">
          {activeTab === "organization" ? <><article className="settings-card"><div className="settings-card-head"><Globe2 size={21} /><div><h3>Dane organizacji</h3><p>Informacje widoczne w panelu pracowników.</p></div></div><div className="settings-form-grid"><label>Pełna nazwa firmy<input value={legalName} onChange={(event) => setLegalName(event.target.value)} /></label><label>NIP<input value={nip} onChange={(event) => setNip(event.target.value)} /></label><label>Nazwa w panelu<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label><label>Tryb danych<input value={production ? "Dane produkcyjne" : "Demonstracja"} readOnly /></label></div></article><article className="settings-card"><div className="settings-card-head"><Globe2 size={21} /><div><h3>Adres portalu</h3><p>Dedykowany adres logowania dla Twojej firmy.</p></div></div><label className="domain-input"><span>https://</span><input value={organization?.slug || "client231"} readOnly onChange={() => undefined} /><b>.epito.pl</b><button type="button" onClick={() => void copyPortalAddress()} aria-label="Kopiuj adres"><Copy size={17} /></button></label><small className="field-help">Zmiana adresu wymaga kontaktu z administratorem platformy.</small></article></> : null}
          {activeTab === "appearance" ? <article className="settings-card"><div className="settings-card-head"><Palette size={21} /><div><h3>Wygląd portalu</h3><p>Dopasuj panel do marki swojej firmy. Zmiany są widoczne po zapisaniu.</p></div></div><div className="branding-row"><label className="logo-upload">{organization?.settings?.branding?.logoKey && production ? <img src={`/api/workspace/settings/logo?v=${logoVersion}`} alt="Logo organizacji" /> : <Plus size={20} />}<span>{logoUploading ? "Wgrywanie" : organization?.settings?.branding?.logoKey ? "Zmień logo" : "Dodaj logo"}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} disabled={logoUploading} /></label><label>Kolor akcentu<div className="color-control"><input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value.toUpperCase())} /><input value={accentColor} onChange={(event) => setAccentColor(event.target.value.toUpperCase())} maxLength={7} /></div></label><label>Nazwa w nagłówku<input value={headerName} onChange={(event) => setHeaderName(event.target.value)} /></label></div></article> : null}
          {activeTab === "notifications" ? <article className="settings-card"><div className="settings-card-head"><Bell size={21} /><div><h3>Powiadomienia</h3><p>Określ, jakie wiadomości otrzymuje zespół.</p></div></div><div className="toggle-list"><label><span><strong>Powiadomienia e-mail</strong><small>Nowe dokumenty i wiadomości od biura.</small></span><input type="checkbox" checked={emailNotifications} onChange={() => setEmailNotifications((value) => !value)} /></label><label><span><strong>Przypomnienia o płatnościach</strong><small>Wiadomość 3 dni przed terminem.</small></span><input type="checkbox" checked={paymentReminders} onChange={() => setPaymentReminders((value) => !value)} /></label></div></article> : null}
          {activeTab === "security" ? <><article className="settings-card security-card"><div className="settings-card-head"><ShieldCheck size={21} /><div><h3>Bezpieczeństwo i nadzór</h3><p>Dostęp supervisorski jest audytowany, a dane organizacji są odseparowane w PostgreSQL.</p></div></div><div className="security-details"><span><Check size={17} /> Rejestr logowań i zmian uprawnień</span><span><Check size={17} /> Izolacja danych między organizacjami</span><span><Check size={17} /> Sesje unieważniane po wylogowaniu</span></div></article><form className="settings-card password-card" onSubmit={changePassword}><div className="settings-card-head"><KeyRound size={21} /><div><h3>Zmień hasło</h3><p>Nowe hasło musi mieć co najmniej 12 znaków, literę i cyfrę.</p></div></div><div className="settings-form-grid"><label>Obecne hasło<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>Nowe hasło<input type="password" autoComplete="new-password" minLength={12} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label></div><button className="button button-dark" type="submit" disabled={passwordPending}>{passwordPending ? "Zapisywanie" : "Zmień hasło"}</button></form></> : null}
        </div>
      </div>
    </section>
  );
}
