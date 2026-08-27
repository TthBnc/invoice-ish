/**
 * One-time source-of-truth manifest for the invoices created by the menubar
 * app before Invoice-ish Web existed. Keep the original invoice identifiers,
 * dates, names, and descriptions here so the import remains reviewable and
 * deterministic.
 */

export type HistoricalInvoice = {
  invoiceNumber: `ISH-${string}`;
  issueDate: `${number}-${number}-${number}`;
  sourceRecipient: string;
  canonicalRecipient: string;
  amountForint: number;
  items: readonly {
    description: string;
    amountForint: number;
  }[];
};

export const HISTORICAL_INVOICES = [
  {
    invoiceNumber: "ISH-0001",
    issueDate: "2026-05-18",
    sourceRecipient: "bocsbe",
    canonicalRecipient: "másik Bence",
    amountForint: 3_000,
    items: [
      { description: "assembly-guide", amountForint: 1_500 },
      { description: "assembly-guide-foldgomb", amountForint: 1_500 },
    ],
  },
  {
    invoiceNumber: "ISH-0002",
    issueDate: "2026-05-18",
    sourceRecipient: "bocsbe",
    canonicalRecipient: "másik Bence",
    amountForint: 1_500,
    items: [{ description: "beszólás", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0003",
    issueDate: "2026-05-18",
    sourceRecipient: "másik Bence",
    canonicalRecipient: "másik Bence",
    amountForint: 1_500,
    items: [{ description: "Kéne egy felület a kompozitosoknak, hogy ne", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0004",
    issueDate: "2026-05-18",
    sourceRecipient: "Bölö",
    canonicalRecipient: "Bölö",
    amountForint: 1_500,
    items: [{ description: "privát képek", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0005",
    issueDate: "2026-05-19",
    sourceRecipient: "bocsbe",
    canonicalRecipient: "másik Bence",
    amountForint: 1_500,
    items: [{ description: "simulation", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0006",
    issueDate: "2026-05-27",
    sourceRecipient: "Tomi",
    canonicalRecipient: "Tomi",
    amountForint: 1_500,
    items: [{ description: "szoftver cs", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0007",
    issueDate: "2026-06-02",
    sourceRecipient: "Bölö",
    canonicalRecipient: "Bölö",
    amountForint: 15_000,
    items: [{ description: "hogy képzeled", amountForint: 15_000 }],
  },
  {
    invoiceNumber: "ISH-0008",
    issueDate: "2026-06-03",
    sourceRecipient: "zoli",
    canonicalRecipient: "zoli",
    amountForint: 1_500,
    items: [{ description: "smc parkolás", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0009",
    issueDate: "2026-06-22",
    sourceRecipient: "bölö department",
    canonicalRecipient: "bölö department",
    amountForint: 3_000,
    items: [
      { description: "1 hetes tech support", amountForint: 1_500 },
      { description: "extra fee mert miért ne", amountForint: 1_500 },
    ],
  },
  {
    invoiceNumber: "ISH-0010",
    issueDate: "2026-06-22",
    sourceRecipient: "bölö",
    canonicalRecipient: "Bölö",
    amountForint: 1_500,
    items: [{ description: "érzelmi kár", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0011",
    issueDate: "2026-06-23",
    sourceRecipient: "Gabi",
    canonicalRecipient: "Gabi",
    amountForint: 1_500,
    items: [{ description: "tech support", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0012",
    issueDate: "2026-07-01",
    sourceRecipient: "zsombro",
    canonicalRecipient: "zsombro",
    amountForint: 1_500,
    items: [{ description: "tech support", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0013",
    issueDate: "2026-07-17",
    sourceRecipient: "csabbba",
    canonicalRecipient: "csabbba",
    amountForint: 1_500,
    items: [{ description: "tech support", amountForint: 1_500 }],
  },
  {
    invoiceNumber: "ISH-0014",
    issueDate: "2026-07-30",
    sourceRecipient: "Bölö",
    canonicalRecipient: "Bölö",
    amountForint: 1_500,
    items: [{ description: "excel javítás", amountForint: 1_500 }],
  },
] as const satisfies readonly HistoricalInvoice[];

export const HISTORICAL_PROFILE_NAMES = [
  "másik Bence",
  "Bölö",
  "bölö department",
  "Tomi",
  "zoli",
  "Gabi",
  "zsombro",
  "csabbba",
] as const;

export const HISTORICAL_TOTAL_FORINT = HISTORICAL_INVOICES.reduce(
  (total, invoice) => total + invoice.amountForint,
  0,
);

export const HISTORICAL_MAX_NUMBER = 14;
