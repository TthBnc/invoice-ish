"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CircleNotch,
  DownloadSimple,
  FileText,
  LockKey,
  PencilSimple,
  Plus,
  Receipt,
  SignOut,
  SlidersHorizontal,
  Trash,
  UserCircle,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  downloadInvoicePdf,
  formatCurrency,
  formatInvoiceDate,
  formatInvoiceNumber,
  formatQuantity,
  syncDueDateWithIssueDate,
  validateInvoice,
  type InvoiceCurrency,
  type InvoiceLocale,
} from "@/src/lib/invoice";

type Currency = "HUF" | "USD" | "EUR";
type LedgerType = "charge" | "payment" | "adjustment";

type Profile = {
  id: string;
  name: string;
  currency: Currency;
  createdAt: string;
  updatedAt: string;
  lifetimeChargedCents: number;
  lifetimePaidCents: number;
  currentBalanceCents: number;
};

type LedgerEntry = {
  id: string;
  profileId: string;
  type: LedgerType;
  amountCents: number;
  impactCents: number;
  note: string | null;
  createdAt: string;
};

type ProfileDetail = Profile & { transactions: LedgerEntry[] };

type EditableLineItem = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type EditableInvoice = {
  invoiceNumber: string;
  senderName: string;
  recipientName: string;
  issueDate: string;
  dueDate: string;
  currency: InvoiceCurrency;
  locale: InvoiceLocale;
  lineItems: EditableLineItem[];
  note: string;
};

type InvoiceField = Exclude<keyof EditableInvoice, "lineItems">;
type FormErrors = Record<string, string>;
type LoadingState = "idle" | "loading" | "ready" | "error";

const SCALE = 100;
const MAX_SAFE_CENTS = 9_000_000_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, { ...init, headers });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string"
      ? body.error
      : "Something went wrong. Try again.";
    throw new ApiError(message, response.status);
  }

  return body as T;
}

function localDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function newLineItem(id = "line-1"): EditableLineItem {
  return { id, description: "", quantity: "1", unitPrice: "1500" };
}

function initialInvoice(): EditableInvoice {
  return {
    invoiceNumber: "",
    senderName: "",
    recipientName: "",
    issueDate: localDate(),
    dueDate: localDate(),
    currency: "HUF",
    locale: "en",
    lineItems: [newLineItem()],
    note: "",
  };
}

function decimalText(value: string): string {
  let normalized = value.trim().replace(/\s/g, "");
  if (normalized.includes(",") && normalized.includes(".")) {
    if (normalized.lastIndexOf(",") > normalized.lastIndexOf(".")) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else {
    normalized = normalized.replace(",", ".");
  }
  return normalized;
}

function parseMajorNumber(value: string): number | null {
  const normalized = decimalText(value);
  if (!normalized || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMajorAmountToCents(value: string, currency: Currency): number | null {
  const normalized = decimalText(value);
  const fractionDigits = normalized.replace(/^[+-]/, "").split(".")[1] ?? "";
  if (currency === "HUF" && fractionDigits.length > 0) return null;
  if (currency !== "HUF" && fractionDigits.length > 2) return null;
  const parsed = parseMajorNumber(value);
  if (parsed === null) return null;
  const cents = Math.round(parsed * SCALE);
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_SAFE_CENTS) return null;
  if (Math.abs(parsed * SCALE - cents) > Number.EPSILON * Math.max(1, Math.abs(parsed * SCALE))) return null;
  return cents;
}

function profileAmount(cents: number, currency: Currency): string {
  const amount = cents / SCALE;
  if (currency === "HUF") {
    return `${new Intl.NumberFormat("hu-HU", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)} Ft`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function ledgerAmountHint(currency: Currency): string {
  if (currency === "HUF") return "Enter a whole forint amount.";
  if (currency === "USD") return "Enter a dollar amount with up to two decimals.";
  return "Enter a euro amount with up to two decimals.";
}

function signedProfileAmount(cents: number, currency: Currency): string {
  return cents > 0
    ? `+${profileAmount(cents, currency)}`
    : cents < 0
      ? `-${profileAmount(Math.abs(cents), currency)}`
      : profileAmount(0, currency);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function Field({
  id,
  label,
  optional = false,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label} {optional ? <span className="optional">Optional</span> : null}
      </label>
      {children}
      {hint ? <p id={`${id}-hint`} className="field-hint">{hint}</p> : null}
      {error ? <p id={`${id}-error`} className="field-error" role="alert">{error}</p> : null}
    </div>
  );
}

function StatusIcon({ label = "Loading" }: { label?: string }) {
  return <CircleNotch className="spin" size={18} weight="bold" aria-label={label} />;
}

function InvoicePreview({ invoice }: { invoice: EditableInvoice }) {
  const previewItems = invoice.lineItems
    .map((item) => {
      const quantity = parseMajorNumber(item.quantity) ?? 0;
      const unitPrice = parseMajorNumber(item.unitPrice) ?? 0;
      return { ...item, quantity, unitPrice, amount: quantity * unitPrice };
    })
    .filter((item) => item.description.trim() || item.unitPrice > 0);
  const total = previewItems.reduce((sum, item) => sum + item.amount, 0);
  const invoiceNumber = invoice.invoiceNumber
    ? formatInvoiceNumber(invoice.invoiceNumber)
    : "Assigned on download";
  const sender = invoice.senderName.trim() || "Your business";
  const recipient = invoice.recipientName.trim() || "Client name";

  return (
    <aside className="preview-wrap" aria-label="Invoice preview">
      <div className="preview-toolbar">
        <div>
          <span className="section-kicker">Live preview</span>
          <p>Ready to save as a PDF</p>
        </div>
        <Receipt size={20} weight="regular" aria-hidden="true" />
      </div>
      <div className="invoice-paper">
        <div className="paper-head">
          <div>
            <span className="paper-wordmark">Invoice-ish</span>
            <h3>{invoice.locale === "hu" ? "Számla" : "Invoice"}</h3>
          </div>
          <div className="paper-meta">
            <strong>{invoiceNumber}</strong>
            <span>{invoice.issueDate ? formatInvoiceDate(invoice.issueDate, invoice.locale) : "Issue date"}</span>
            {invoice.dueDate ? <span>Due {formatInvoiceDate(invoice.dueDate, invoice.locale)}</span> : null}
          </div>
        </div>

        <div className="paper-parties">
          <div>
            <span className="paper-label">From</span>
            <strong>{sender}</strong>
          </div>
          <div>
            <span className="paper-label">Bill to</span>
            <strong>{recipient}</strong>
          </div>
        </div>

        <div className="paper-table" role="table" aria-label="Invoice line items">
          <div className="paper-table-head" role="row">
            <span role="columnheader">Description</span>
            <span role="columnheader">Amount</span>
          </div>
          {previewItems.length ? previewItems.map((item) => (
            <div className="paper-table-row" role="row" key={item.id}>
              <span role="cell">
                {item.description.trim() || "Line item"}
                <small>{formatQuantity(item.quantity, invoice.locale)} × {formatCurrency(item.unitPrice, invoice.currency, invoice.locale)}</small>
              </span>
              <strong role="cell">{formatCurrency(item.amount, invoice.currency, invoice.locale)}</strong>
            </div>
          )) : (
            <div className="paper-empty">Add a line item to see it here.</div>
          )}
        </div>

        <div className="paper-total">
          <span>{invoice.locale === "hu" ? "Fizetendő" : "Total due"}</span>
          <strong>{formatCurrency(total, invoice.currency, invoice.locale)}</strong>
        </div>
        <div className="paper-note">{invoice.note.trim() || "Thank you for your business."}</div>
      </div>
    </aside>
  );
}

function ProfileCard({
  profile,
  selected,
  onSelect,
}: {
  profile: Profile;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={`profile-card${selected ? " selected" : ""}`}>
      <div className="profile-card-top">
        <div className="profile-avatar" aria-hidden="true"><UserCircle size={25} weight="regular" /></div>
        <div>
          <h3>{profile.name}</h3>
          <span className="currency-tag">{profile.currency}</span>
        </div>
      </div>
      <p className="balance-label">Current balance</p>
      <p className="balance-value">{profileAmount(profile.currentBalanceCents, profile.currency)}</p>
      <dl className="profile-stats">
        <div><dt>Charged</dt><dd>{profileAmount(profile.lifetimeChargedCents, profile.currency)}</dd></div>
        <div><dt>Paid</dt><dd>{profileAmount(profile.lifetimePaidCents, profile.currency)}</dd></div>
      </dl>
      <button className="text-button" type="button" onClick={onSelect} aria-pressed={selected}>
        {selected ? "Hide activity" : "View activity"}
        {selected ? <X size={16} aria-hidden="true" /> : <ArrowUpRight size={16} aria-hidden="true" />}
      </button>
    </article>
  );
}

function ProfileDetailPanel({
  detail,
  status,
  error,
}: {
  detail: ProfileDetail | null;
  status: LoadingState;
  error: string;
}) {
  if (status === "loading") {
    return <div className="detail-panel detail-loading"><StatusIcon /> <span>Loading activity</span></div>;
  }
  if (status === "error") {
    return <div className="detail-panel inline-error" role="alert">{error}</div>;
  }
  if (!detail) return null;

  return (
    <section className="detail-panel" aria-labelledby="activity-title">
      <div className="detail-head">
        <div>
          <span className="section-kicker">Activity</span>
          <h3 id="activity-title">{detail.name}</h3>
        </div>
        <p className="detail-balance">{profileAmount(detail.currentBalanceCents, detail.currency)}</p>
      </div>
      {detail.transactions.length === 0 ? (
        <div className="empty-state compact"><Receipt size={21} aria-hidden="true" /><p>No activity recorded yet.</p></div>
      ) : (
        <ol className="transaction-list">
          {detail.transactions.map((entry) => (
            <li key={entry.id}>
              <div className={`transaction-icon ${entry.impactCents >= 0 ? "positive" : "negative"}`} aria-hidden="true">
                {entry.impactCents >= 0 ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
              </div>
              <div className="transaction-copy">
                <strong>{entry.type === "charge" ? "Charge" : entry.type === "payment" ? "Payment" : "Adjustment"}</strong>
                <span>{entry.note || "No note"}</span>
              </div>
              <div className="transaction-amount">
                <strong className={entry.impactCents >= 0 ? "positive-text" : "negative-text"}>{signedProfileAmount(entry.impactCents, detail.currency)}</strong>
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function InvoiceApp() {
  const [invoice, setInvoice] = useState<EditableInvoice>(initialInvoice);
  const [dueDateEdited, setDueDateEdited] = useState(false);
  const [invoiceErrors, setInvoiceErrors] = useState<FormErrors>({});
  const [downloadState, setDownloadState] = useState<"idle" | "loading" | "error">("idle");
  const [downloadError, setDownloadError] = useState("");
  const [downloadNotice, setDownloadNotice] = useState("");

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profilesStatus, setProfilesStatus] = useState<LoadingState>("loading");
  const [profilesError, setProfilesError] = useState("");
  const [attachedProfileId, setAttachedProfileId] = useState<string | null>(null);
  const [recipientSuggestionsOpen, setRecipientSuggestionsOpen] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [profileDetail, setProfileDetail] = useState<ProfileDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<LoadingState>("idle");
  const [detailError, setDetailError] = useState("");
  const detailRequest = useRef(0);

  const [authState, setAuthState] = useState<"checking" | "locked" | "unlocked">("checking");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileCurrency, setNewProfileCurrency] = useState<Currency>("HUF");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingCurrency, setEditingCurrency] = useState<Currency>("HUF");
  const [ledgerType, setLedgerType] = useState<LedgerType>("charge");
  const [ledgerAmount, setLedgerAmount] = useState("");
  const [ledgerNote, setLedgerNote] = useState("");
  const [adminBusy, setAdminBusy] = useState<string | null>(null);
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");

  const invoicePayload = useMemo(() => ({
    // A real number is reserved only after draft validation and immediately
    // before PDF generation. This placeholder is never sent to the PDF or API.
    invoiceNumber: "AUTO",
    sender: {
      name: invoice.senderName,
    },
    recipient: {
      name: invoice.recipientName,
    },
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate || undefined,
    currency: invoice.currency,
    lineItems: invoice.lineItems.map(({ description, quantity, unitPrice }) => ({ description, quantity, unitPrice })),
    note: invoice.note || undefined,
    locale: invoice.locale,
  }), [invoice]);

  const refreshProfiles = useCallback(async (): Promise<Profile[]> => {
    setProfilesStatus("loading");
    try {
      const result = await apiRequest<{ profiles: Profile[] }>("/api/profiles");
      const nextProfiles = Array.isArray(result.profiles) ? result.profiles : [];
      setProfiles(nextProfiles);
      setProfilesStatus("ready");
      setProfilesError("");
      setAttachedProfileId((current) => current && nextProfiles.some((profile) => profile.id === current) ? current : null);
      setSelectedProfileId((current) => current && nextProfiles.some((profile) => profile.id === current) ? current : null);
      return nextProfiles;
    } catch (error) {
      setProfilesStatus("error");
      setProfilesError(errorMessage(error));
      return [];
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const result = await apiRequest<{ authenticated: boolean }>("/api/auth/status");
      setAuthState(result.authenticated ? "unlocked" : "locked");
    } catch {
      setAuthState("locked");
    }
  }, []);

  useEffect(() => {
    void refreshProfiles();
    void checkAuth();
  }, [checkAuth, refreshProfiles]);

  const loadProfileDetail = useCallback(async (id: string) => {
    const requestId = detailRequest.current + 1;
    detailRequest.current = requestId;
    setDetailStatus("loading");
    setDetailError("");
    try {
      const result = await apiRequest<{ profile: Profile; transactions: LedgerEntry[] }>(`/api/profiles/${id}`);
      if (detailRequest.current !== requestId) return;
      setProfileDetail({ ...result.profile, transactions: result.transactions });
      setDetailStatus("ready");
    } catch (error) {
      if (detailRequest.current !== requestId) return;
      setDetailStatus("error");
      setDetailError(errorMessage(error));
    }
  }, []);

  function updateInvoice(field: InvoiceField, value: string) {
    if (field === "dueDate") {
      setDueDateEdited(true);
      setInvoice((current) => ({ ...current, dueDate: value }));
    } else if (field === "issueDate") {
      setInvoice((current) => ({
        ...current,
        issueDate: value,
        dueDate: syncDueDateWithIssueDate(
          current.issueDate,
          current.dueDate,
          value,
          dueDateEdited,
        ),
      }));
    } else {
      setInvoice((current) => ({ ...current, [field]: value }));
    }
    setInvoiceErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (field === "issueDate") delete next.dueDate;
      return next;
    });
  }

  function updateRecipientName(value: string) {
    setInvoice((current) => ({ ...current, recipientName: value }));
    setAttachedProfileId(null);
    setInvoiceErrors((current) => {
      if (!current["recipient.name"]) return current;
      const next = { ...current };
      delete next["recipient.name"];
      return next;
    });
    setRecipientSuggestionsOpen(true);
    setActiveSuggestionIndex(-1);
  }

  function attachProfile(profile: Profile) {
    setInvoice((current) => ({ ...current, recipientName: profile.name }));
    setAttachedProfileId(profile.id);
    setInvoiceErrors((current) => {
      if (!current["recipient.name"]) return current;
      const next = { ...current };
      delete next["recipient.name"];
      return next;
    });
    setRecipientSuggestionsOpen(false);
    setActiveSuggestionIndex(-1);
  }

  function detachProfile() {
    setAttachedProfileId(null);
  }

  function updateLineItem(index: number, field: keyof Omit<EditableLineItem, "id">, value: string) {
    setInvoice((current) => ({
      ...current,
      lineItems: current.lineItems.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
    setInvoiceErrors((current) => {
      const next = { ...current };
      delete next[`lineItems.${index}.${field}`];
      delete next[`lineItems.${index}`];
      return next;
    });
  }

  function addLineItem() {
    setInvoice((current) => ({
      ...current,
      lineItems: [...current.lineItems, newLineItem(`line-${Date.now()}-${current.lineItems.length}`)],
    }));
  }

  function removeLineItem(index: number) {
    setInvoice((current) => current.lineItems.length > 1
      ? { ...current, lineItems: current.lineItems.filter((_, itemIndex) => itemIndex !== index) }
      : current);
  }

  async function handleDownload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDownloadNotice("");
    const draftResult = validateInvoice(invoicePayload);
    if (!draftResult.valid || !draftResult.data) {
      const errors: FormErrors = {};
      for (const issue of draftResult.issues) {
        if (!errors[issue.field]) errors[issue.field] = issue.message;
      }
      setInvoiceErrors(errors);
      setDownloadError("Check the highlighted fields before downloading.");
      setDownloadState("error");
      return;
    }

    setInvoiceErrors({});
    setDownloadError("");
    setDownloadState("loading");
    const profileIdAtSubmit = attachedProfileId;
    const profileAtSubmit = profileIdAtSubmit
      ? profiles.find((profile) => profile.id === profileIdAtSubmit) ?? null
      : null;
    let pdfDownloaded = false;
    try {
      const reservation = await apiRequest<{ invoiceNumber: string }>("/api/invoices/reserve", {
        method: "POST",
      });
      const result = validateInvoice({ ...invoicePayload, invoiceNumber: reservation.invoiceNumber });
      if (!result.valid || !result.data) {
        throw new Error("The reserved invoice number could not be used.");
      }

      await downloadInvoicePdf(result.data, {
        filename: `${reservation.invoiceNumber}.pdf`,
        author: "Invoice-ish",
      });
      pdfDownloaded = true;

      if (profileIdAtSubmit) {
        const amountCents = Math.round(result.data.total * SCALE);
        if (!Number.isSafeInteger(amountCents) || Math.abs(amountCents) > MAX_SAFE_CENTS) {
          throw new Error("The invoice total is too large to attach to this profile.");
        }

        const attachment = await apiRequest<unknown>(`/api/profiles/${profileIdAtSubmit}/invoice`, {
          method: "POST",
          body: JSON.stringify({
            amountCents,
            invoiceNumber: reservation.invoiceNumber,
          }),
        });
        const idempotent = isRecord(attachment) && (
          attachment.idempotent === true
          || attachment.alreadyExists === true
          || attachment.duplicate === true
        );
        await refreshProfiles();
        if (selectedProfileId === profileIdAtSubmit) void loadProfileDetail(profileIdAtSubmit);
        setDownloadNotice(idempotent
          ? "PDF downloaded. This invoice was already attached to the selected profile."
          : "PDF downloaded and the selected profile balance was updated.");
      } else {
        setDownloadNotice("PDF downloaded.");
      }
      setDownloadState("idle");
    } catch (error) {
      setDownloadState("error");
      setDownloadError(profileIdAtSubmit && pdfDownloaded
        ? `PDF downloaded, but ${profileAtSubmit?.name || "the selected profile"} was not updated. ${errorMessage(error)}`
        : errorMessage(error));
    }
  }

  function selectProfile(id: string) {
    if (selectedProfileId === id) {
      setSelectedProfileId(null);
      setProfileDetail(null);
      setDetailStatus("idle");
      return;
    }
    setSelectedProfileId(id);
    void loadProfileDetail(id);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) {
      setAuthError("Enter the admin passphrase.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await apiRequest("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
      setAuthState("unlocked");
      setPassword("");
      setAdminNotice("Admin controls unlocked.");
      await refreshProfiles();
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    setAuthBusy(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setAuthState("locked");
      setAdminNotice("");
      setAdminError("");
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleCreateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newProfileName.trim()) {
      setAdminError("Enter a profile name.");
      return;
    }
    setAdminBusy("create");
    setAdminError("");
    setAdminNotice("");
    try {
      const result = await apiRequest<{ profile: Profile }>("/api/profiles", {
        method: "POST",
        body: JSON.stringify({ name: newProfileName.trim(), currency: newProfileCurrency }),
      });
      setNewProfileName("");
      setAdminNotice(`${result.profile.name} was created.`);
      const nextProfiles = await refreshProfiles();
      if (nextProfiles.some((profile) => profile.id === result.profile.id)) {
        setSelectedProfileId(result.profile.id);
        void loadProfileDetail(result.profile.id);
      }
    } catch (error) {
      setAdminError(errorMessage(error));
    } finally {
      setAdminBusy(null);
    }
  }

  function startEditing(profile: Profile) {
    setEditingProfileId(profile.id);
    setEditingName(profile.name);
    setEditingCurrency(profile.currency);
    setAdminError("");
  }

  function cancelEditing() {
    setEditingProfileId(null);
    setEditingName("");
  }

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (!editingName.trim()) {
      setAdminError("Enter a profile name.");
      return;
    }
    setAdminBusy(`edit-${id}`);
    setAdminError("");
    try {
      await apiRequest(`/api/profiles/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: editingName.trim(), currency: editingCurrency }),
      });
      cancelEditing();
      setAdminNotice("Profile updated.");
      await refreshProfiles();
      if (selectedProfileId === id) void loadProfileDetail(id);
    } catch (error) {
      setAdminError(errorMessage(error));
    } finally {
      setAdminBusy(null);
    }
  }

  async function handleDeleteProfile(profile: Profile) {
    if (!window.confirm(`Delete ${profile.name} and its ledger history?`)) return;
    setAdminBusy(`delete-${profile.id}`);
    setAdminError("");
    try {
      await apiRequest(`/api/profiles/${profile.id}`, { method: "DELETE" });
      if (selectedProfileId === profile.id) {
        setSelectedProfileId(null);
        setProfileDetail(null);
        setDetailStatus("idle");
      }
      setAdminNotice(`${profile.name} was deleted.`);
      await refreshProfiles();
    } catch (error) {
      setAdminError(errorMessage(error));
    } finally {
      setAdminBusy(null);
    }
  }

  async function handleLedgerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProfileId || !selectedProfile) {
      setAdminError("Select a profile first.");
      return;
    }
    const amountCents = parseMajorAmountToCents(ledgerAmount, selectedProfile.currency);
    if (amountCents === null || amountCents === 0 || ((ledgerType === "charge" || ledgerType === "payment") && amountCents < 0)) {
      setAdminError(ledgerType === "adjustment"
        ? selectedProfile.currency === "HUF" ? "Enter a non-zero whole forint amount." : "Enter a non-zero amount with up to two decimals."
        : selectedProfile.currency === "HUF" ? "Enter a positive whole forint amount." : "Enter a positive amount with up to two decimals.");
      return;
    }
    setAdminBusy("ledger");
    setAdminError("");
    try {
      await apiRequest(`/api/profiles/${selectedProfileId}/${ledgerType}`, {
        method: "POST",
        body: JSON.stringify({ amountCents, note: ledgerNote.trim() || undefined }),
      });
      setLedgerAmount("");
      setLedgerNote("");
      setAdminNotice("Ledger entry added.");
      await refreshProfiles();
      void loadProfileDetail(selectedProfileId);
    } catch (error) {
      setAdminError(errorMessage(error));
    } finally {
      setAdminBusy(null);
    }
  }

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const profileSuggestions = useMemo(() => {
    const query = invoice.recipientName.trim().toLowerCase();
    const seenNames = new Set<string>();
    return profiles.filter((profile) => {
      const normalizedName = profile.name.trim().toLowerCase();
      if (seenNames.has(normalizedName)) return false;
      seenNames.add(normalizedName);
      return !query || normalizedName.includes(query);
    });
  }, [invoice.recipientName, profiles]);
  const activeSuggestion = profileSuggestions[activeSuggestionIndex] ?? null;

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#invoice">
          <span className="brand-mark"><FileText size={18} weight="bold" aria-hidden="true" /></span>
          <span>Invoice-ish</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#invoice">Make an invoice</a>
          <a href="#balances">Balance board</a>
          <a href="#admin"><LockKey size={16} aria-hidden="true" /> Admin</a>
        </nav>
      </header>

      <section className="intro" aria-labelledby="page-title">
        <h1 id="page-title">Make the invoice. Keep the record.</h1>
        <p>Build a clear PDF, then check shared balances in one place.</p>
      </section>

      <section id="invoice" className="content-section invoice-section" aria-labelledby="invoice-title">
        <div className="section-heading">
          <h2 id="invoice-title">Make a polished invoice</h2>
          <p>Everything stays in your browser until you choose to download.</p>
        </div>

        <div className="invoice-layout">
          <form className="panel invoice-form" onSubmit={handleDownload} noValidate>
            <div className="form-section">
              <div className="form-section-heading"><h3>Details</h3><span>Required fields are marked by their labels.</span></div>
              <div className="form-grid four-columns">
                <Field id="invoice-number" label="Invoice number" hint="Assigned automatically when you download.">
                  <output id="invoice-number" className="readonly-field">Assigned on download</output>
                </Field>
                <Field id="issue-date" label="Issue date" error={invoiceErrors.issueDate}>
                  <input id="issue-date" type="date" value={invoice.issueDate} onChange={(event) => updateInvoice("issueDate", event.target.value)} aria-invalid={Boolean(invoiceErrors.issueDate)} aria-errormessage={invoiceErrors.issueDate ? "issue-date-error" : undefined} />
                </Field>
                <Field id="due-date" label="Due date" optional error={invoiceErrors.dueDate}>
                  <input id="due-date" type="date" value={invoice.dueDate} onChange={(event) => updateInvoice("dueDate", event.target.value)} aria-invalid={Boolean(invoiceErrors.dueDate)} aria-errormessage={invoiceErrors.dueDate ? "due-date-error" : undefined} />
                </Field>
                <Field id="invoice-currency" label="Currency">
                  <select id="invoice-currency" value={invoice.currency} onChange={(event) => updateInvoice("currency", event.target.value)}>
                    <option value="HUF">HUF</option><option value="USD">USD</option><option value="EUR">EUR</option>
                  </select>
                </Field>
              </div>
              <div className="language-control">
                <span>PDF language</span>
                <div className="segmented-control" role="group" aria-label="PDF language">
                  <button type="button" className={invoice.locale === "en" ? "active" : ""} onClick={() => updateInvoice("locale", "en")}>English</button>
                  <button type="button" className={invoice.locale === "hu" ? "active" : ""} onClick={() => updateInvoice("locale", "hu")}>Magyar</button>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="party-grid">
                <fieldset>
                  <legend>From</legend>
                  <div className="stacked-fields">
                    <Field id="sender-name" label="Name" error={invoiceErrors["sender.name"]}>
                      <input id="sender-name" type="text" value={invoice.senderName} onChange={(event) => updateInvoice("senderName", event.target.value)} aria-invalid={Boolean(invoiceErrors["sender.name"])} aria-errormessage={invoiceErrors["sender.name"] ? "sender-name-error" : undefined} />
                    </Field>
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Bill to</legend>
                  <div className="stacked-fields">
                    <Field id="recipient-name" label="Name" hint="Choose a profile to add this invoice to its balance." error={invoiceErrors["recipient.name"]}>
                      <div className="recipient-combobox">
                        <input
                          id="recipient-name"
                          type="text"
                          role="combobox"
                          autoComplete="off"
                          aria-autocomplete="list"
                          aria-haspopup="listbox"
                          aria-expanded={recipientSuggestionsOpen}
                          aria-controls="recipient-profile-listbox"
                          aria-activedescendant={recipientSuggestionsOpen && activeSuggestion ? `recipient-profile-option-${activeSuggestion.id}` : undefined}
                          value={invoice.recipientName}
                          onFocus={() => {
                            setRecipientSuggestionsOpen(true);
                            setActiveSuggestionIndex(-1);
                          }}
                          onBlur={() => setRecipientSuggestionsOpen(false)}
                          onChange={(event) => updateRecipientName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "ArrowDown") {
                              event.preventDefault();
                              setRecipientSuggestionsOpen(true);
                              if (profileSuggestions.length > 0) {
                                setActiveSuggestionIndex((current) => current < profileSuggestions.length - 1 ? current + 1 : 0);
                              }
                            } else if (event.key === "ArrowUp") {
                              event.preventDefault();
                              setRecipientSuggestionsOpen(true);
                              if (profileSuggestions.length > 0) {
                                setActiveSuggestionIndex((current) => current <= 0 ? profileSuggestions.length - 1 : current - 1);
                              }
                            } else if (event.key === "Enter" && recipientSuggestionsOpen && activeSuggestion) {
                              event.preventDefault();
                              attachProfile(activeSuggestion);
                            } else if (event.key === "Escape") {
                              setRecipientSuggestionsOpen(false);
                            }
                          }}
                          aria-invalid={Boolean(invoiceErrors["recipient.name"])}
                          aria-errormessage={invoiceErrors["recipient.name"] ? "recipient-name-error" : undefined}
                        />
                        {recipientSuggestionsOpen ? (
                          <div id="recipient-profile-listbox" className="profile-suggestions" role="listbox" aria-label="Profiles">
                            {profilesStatus === "loading" ? (
                              <div className="profile-suggestions-empty" role="option" aria-selected="false" aria-disabled="true">Loading profiles</div>
                            ) : profileSuggestions.length > 0 ? profileSuggestions.map((profile, index) => (
                              <div
                                id={`recipient-profile-option-${profile.id}`}
                                className={`profile-suggestion${index === activeSuggestionIndex ? " active" : ""}`}
                                key={profile.id}
                                role="option"
                                aria-selected={profile.id === attachedProfileId}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActiveSuggestionIndex(index)}
                                onClick={() => attachProfile(profile)}
                              >
                                <span>{profile.name}</span>
                                <small>{profile.currency} · {profileAmount(profile.currentBalanceCents, profile.currency)}</small>
                              </div>
                            )) : (
                              <div className="profile-suggestions-empty" role="option" aria-selected="false" aria-disabled="true">No matching profiles</div>
                            )}
                          </div>
                        ) : null}
                        {attachedProfileId ? (
                          <div className="attached-profile-indicator" role="status">
                            <span><Check size={15} weight="bold" aria-hidden="true" /> Attached to <strong>{profiles.find((profile) => profile.id === attachedProfileId)?.name || "profile"}</strong></span>
                            <button type="button" onClick={detachProfile}>Detach</button>
                          </div>
                        ) : null}
                      </div>
                    </Field>
                  </div>
                </fieldset>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-heading">
                <div><h3>Line items</h3><span>Add what the client is paying for.</span></div>
                <button className="small-button" type="button" onClick={addLineItem}><Plus size={16} aria-hidden="true" /> Add item</button>
              </div>
              <div className="line-items" role="table" aria-label="Invoice line items">
                <div className="line-item-head" role="row"><span>Description</span><span>Quantity</span><span>Unit price</span><span>Amount</span><span className="sr-only">Remove</span></div>
                {invoice.lineItems.map((item, index) => {
                  const quantity = parseMajorNumber(item.quantity) ?? 0;
                  const unitPrice = parseMajorNumber(item.unitPrice) ?? 0;
                  const amount = quantity * unitPrice;
                  return (
                    <div className="line-item-row" role="row" key={item.id}>
                      <input type="text" aria-label={`Description for line item ${index + 1}`} placeholder="Design work" value={item.description} onChange={(event) => updateLineItem(index, "description", event.target.value)} aria-invalid={Boolean(invoiceErrors[`lineItems.${index}.description`])} />
                      <input type="text" inputMode="decimal" aria-label={`Quantity for line item ${index + 1}`} placeholder="1" value={item.quantity} onChange={(event) => updateLineItem(index, "quantity", event.target.value)} aria-invalid={Boolean(invoiceErrors[`lineItems.${index}.quantity`])} />
                      <input type="text" inputMode="decimal" aria-label={`Unit price for line item ${index + 1}`} placeholder="0.00" value={item.unitPrice} onChange={(event) => updateLineItem(index, "unitPrice", event.target.value)} aria-invalid={Boolean(invoiceErrors[`lineItems.${index}.unitPrice`])} />
                      <output>{formatCurrency(amount, invoice.currency, invoice.locale)}</output>
                      <button className="icon-button" type="button" onClick={() => removeLineItem(index)} disabled={invoice.lineItems.length === 1} aria-label={`Remove line item ${index + 1}`} title="Remove line item"><Trash size={17} aria-hidden="true" /></button>
                    </div>
                  );
                })}
              </div>
              {invoiceErrors.lineItems ? <p className="field-error" role="alert">{invoiceErrors.lineItems}</p> : null}
            </div>

            <div className="form-section note-section">
              <Field id="invoice-note" label="Note" optional hint="Add payment details or a short thank you.">
                <textarea id="invoice-note" rows={3} value={invoice.note} onChange={(event) => updateInvoice("note", event.target.value)} />
              </Field>
            </div>

            {downloadError ? <div className="form-alert" role="alert">{downloadError}</div> : null}
            {downloadNotice ? <div className="form-success" role="status"><Check size={17} aria-hidden="true" /> {downloadNotice}</div> : null}
            <div className="form-actions">
              <p>PDF generation happens locally in your browser.</p>
              <button className="primary-button" type="submit" disabled={downloadState === "loading"}>
                {downloadState === "loading" ? <StatusIcon label="Creating PDF" /> : <DownloadSimple size={19} aria-hidden="true" />}
                {downloadState === "loading" ? "Creating PDF" : "Download PDF"}
              </button>
            </div>
          </form>

          <InvoicePreview invoice={invoice} />
        </div>
      </section>

      <section id="balances" className="content-section balances-section" aria-labelledby="balances-title">
        <div className="section-heading">
          <h2 id="balances-title">Shared balances</h2>
          <p>Profiles are display-only. No account is needed to view the board.</p>
        </div>
        {profilesStatus === "error" ? <div className="form-alert" role="alert">{profilesError}</div> : null}
        {profilesStatus === "loading" ? (
          <div className="profile-grid" aria-label="Loading balances"><div className="skeleton-card" /><div className="skeleton-card" /><div className="skeleton-card" /></div>
        ) : profilesStatus === "ready" && profiles.length === 0 ? (
          <div className="empty-state"><UserCircle size={26} aria-hidden="true" /><h3>No profiles yet</h3><p>Profiles added by an admin will appear here.</p></div>
        ) : (
          <div className="profile-grid">
            {profiles.map((profile) => <ProfileCard key={profile.id} profile={profile} selected={profile.id === selectedProfileId} onSelect={() => selectProfile(profile.id)} />)}
          </div>
        )}
        {selectedProfileId ? <ProfileDetailPanel detail={profileDetail} status={detailStatus} error={detailError} /> : null}
      </section>

      <section id="admin" className="content-section admin-section" aria-labelledby="admin-title">
        <div className="section-heading">
          <h2 id="admin-title">Manage profiles and balances</h2>
          <p>Unlock this panel with the shared admin passphrase.</p>
        </div>

        {authState === "checking" ? (
          <div className="admin-locked"><StatusIcon /><span>Checking access</span></div>
        ) : authState === "locked" ? (
          <form className="panel auth-panel" onSubmit={handleLogin}>
            <div className="auth-copy"><div className="admin-icon"><LockKey size={22} aria-hidden="true" /></div><div><h3>Admin access</h3><p>The passphrase stays in this browser session.</p></div></div>
            <div className="auth-form-row">
              <Field id="admin-password" label="Admin passphrase" error={authError}><input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(authError)} aria-errormessage={authError ? "admin-password-error" : undefined} /></Field>
              <button className="primary-button" type="submit" disabled={authBusy}>{authBusy ? <StatusIcon /> : <LockKey size={18} aria-hidden="true" />}{authBusy ? "Unlocking" : "Unlock"}</button>
            </div>
          </form>
        ) : (
          <div className="admin-workspace">
            <div className="admin-toolbar"><div><strong>Admin unlocked</strong><span>Profile and ledger changes are enabled.</span></div><button className="secondary-button" type="button" onClick={handleLogout} disabled={authBusy}><SignOut size={17} aria-hidden="true" /> Sign out</button></div>
            {adminError ? <div className="form-alert" role="alert">{adminError}</div> : null}
            {adminNotice ? <div className="form-success" role="status"><Check size={17} aria-hidden="true" /> {adminNotice}</div> : null}
            <div className="admin-grid">
              <section className="panel admin-panel" aria-labelledby="profiles-admin-title">
                <div className="panel-heading"><div><h3 id="profiles-admin-title">Profiles</h3><p>Create or update a balance profile.</p></div><SlidersHorizontal size={20} aria-hidden="true" /></div>
                <form className="create-profile-form" onSubmit={handleCreateProfile}>
                  <Field id="new-profile-name" label="New profile name"><input id="new-profile-name" type="text" value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} placeholder="Client or project" /></Field>
                  <Field id="new-profile-currency" label="Currency"><select id="new-profile-currency" value={newProfileCurrency} onChange={(event) => setNewProfileCurrency(event.target.value as Currency)}><option value="HUF">HUF</option><option value="USD">USD</option><option value="EUR">EUR</option></select></Field>
                  <button className="primary-button" type="submit" disabled={adminBusy === "create"}>{adminBusy === "create" ? <StatusIcon /> : <Plus size={18} aria-hidden="true" />}{adminBusy === "create" ? "Creating" : "Create"}</button>
                </form>
                <div className="admin-profile-list">
                  {profiles.length === 0 ? <div className="empty-state compact"><UserCircle size={21} aria-hidden="true" /><p>No profiles to manage.</p></div> : profiles.map((profile) => (
                    <article className={`admin-profile-row${profile.id === selectedProfileId ? " selected" : ""}`} key={profile.id}>
                      {editingProfileId === profile.id ? (
                        <form className="edit-profile-form" onSubmit={(event) => void handleUpdateProfile(event, profile.id)}>
                          <Field id={`edit-name-${profile.id}`} label="Profile name"><input id={`edit-name-${profile.id}`} type="text" value={editingName} onChange={(event) => setEditingName(event.target.value)} /></Field>
                          <Field id={`edit-currency-${profile.id}`} label="Currency"><select id={`edit-currency-${profile.id}`} value={editingCurrency} onChange={(event) => setEditingCurrency(event.target.value as Currency)}><option value="HUF">HUF</option><option value="USD">USD</option><option value="EUR">EUR</option></select></Field>
                          <div className="row-actions"><button className="primary-button compact-button" type="submit" disabled={adminBusy === `edit-${profile.id}`}>{adminBusy === `edit-${profile.id}` ? <StatusIcon /> : <Check size={16} aria-hidden="true" />} Save</button><button className="icon-button" type="button" onClick={cancelEditing} aria-label="Cancel editing" title="Cancel editing"><X size={17} aria-hidden="true" /></button></div>
                        </form>
                      ) : (
                        <>
                          <button className="admin-profile-main" type="button" onClick={() => selectProfile(profile.id)}><span><strong>{profile.name}</strong><small>{profile.currency}</small></span><strong>{profileAmount(profile.currentBalanceCents, profile.currency)}</strong></button>
                          <div className="row-actions"><button className="icon-button" type="button" onClick={() => startEditing(profile)} aria-label={`Edit ${profile.name}`} title={`Edit ${profile.name}`}><PencilSimple size={17} aria-hidden="true" /></button><button className="icon-button danger-button" type="button" onClick={() => void handleDeleteProfile(profile)} disabled={adminBusy === `delete-${profile.id}`} aria-label={`Delete ${profile.name}`} title={`Delete ${profile.name}`}><Trash size={17} aria-hidden="true" /></button></div>
                        </>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel admin-panel" aria-labelledby="ledger-admin-title">
                <div className="panel-heading"><div><h3 id="ledger-admin-title">Add ledger entry</h3><p>Record a charge, payment, or signed adjustment.</p></div><Receipt size={20} aria-hidden="true" /></div>
                {!selectedProfile ? <div className="empty-state compact"><ArrowUpRight size={21} aria-hidden="true" /><p>Select a profile to add an entry.</p></div> : (
                  <form className="ledger-form" onSubmit={handleLedgerSubmit}>
                    <div className="selected-profile-banner"><span>Selected profile</span><strong>{selectedProfile.name}</strong><small>{selectedProfile.currency} balance {profileAmount(selectedProfile.currentBalanceCents, selectedProfile.currency)}</small></div>
                    <Field id="ledger-type" label="Entry type"><select id="ledger-type" value={ledgerType} onChange={(event) => setLedgerType(event.target.value as LedgerType)}><option value="charge">Charge</option><option value="payment">Payment</option><option value="adjustment">Adjustment</option></select></Field>
                    <Field id="ledger-amount" label="Amount" hint={ledgerAmountHint(selectedProfile.currency)}><input id="ledger-amount" type="text" inputMode="decimal" value={ledgerAmount} onChange={(event) => setLedgerAmount(event.target.value)} placeholder={selectedProfile.currency === "HUF" ? "1250" : "1250.00"} /></Field>
                    <Field id="ledger-note" label="Note" optional><textarea id="ledger-note" rows={3} value={ledgerNote} onChange={(event) => setLedgerNote(event.target.value)} placeholder="What is this for?" /></Field>
                    <button className="primary-button" type="submit" disabled={adminBusy === "ledger"}>{adminBusy === "ledger" ? <StatusIcon /> : <Check size={18} aria-hidden="true" />}{adminBusy === "ledger" ? "Saving" : "Save entry"}</button>
                  </form>
                )}
              </section>
            </div>
          </div>
        )}
      </section>

      <footer className="site-footer"><span>Invoice-ish</span><span>Clear records for small work.</span></footer>
    </main>
  );
}
