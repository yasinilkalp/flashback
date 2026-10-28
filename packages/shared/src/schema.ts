import { z } from 'zod';

/** FR-PKG-05: şema sürümü. Ek alanlar sürümü artırmaz; alan kaldırma/anlam değişikliği ana sürümü artırır. */
export const SCHEMA_VERSION = 1 as const;

/** FR-RCV-SEC-04 / §9.1: olay kimliği biçimi (UTC). */
export const INCIDENT_ID_RE = /^fb-\d{8}-\d{6}-[a-z0-9]{4}$/;

const jsonValue: z.ZodType<unknown> = z.unknown();

export const StepSchema = z.object({
  t: z.number(),
  type: z.enum(['click', 'input', 'key', 'navigate']),
  selector: z.string().optional(),
  fallbackSelectors: z.array(z.string()).default([]),
  value: z.string().optional(),
  /** Değer gizlendiyse türü (ör. "email", "password"). Repro'da sentetik değer kullanılır (FR-REPRO-13). */
  valueRedactedAs: z
    .string()
    .regex(/^[a-z_]{1,32}$/, 'yalnızca küçük harf ve alt çizgi')
    .optional(),
  key: z.string().optional(),
  url: z.string().optional(),
  /**
   * Eylem öğesi olmayan bir kapsayıcıya yapılan fare tıklamasında, tıklamanın öğe kutusu içindeki göreli
   * konumu (0–1). Repro aynı noktaya tıklar; öğenin ortasına tıklamak içindeki bir düğmeye denk gelebilir.
   */
  at: z
    .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
});

export const NetworkEntrySchema = z.object({
  t: z.number(),
  method: z.string(),
  url: z.string(),
  status: z.number(),
  durationMs: z.number(),
  reqHeaders: z.record(z.string(), z.string()).default({}),
  resHeaders: z.record(z.string(), z.string()).default({}),
  reqBody: z.string().optional(),
  resBody: z.string().optional(),
  contentType: z.string().optional(),
  bodySize: z.number().optional(),
  truncated: z.boolean().default(false),
  error: z.string().optional(),
});

export const ConsoleEntrySchema = z.object({
  t: z.number(),
  level: z.enum(['error', 'warn', 'uncaught', 'unhandledrejection']),
  message: z.string(),
  stack: z.string().optional(),
  source: z.string().optional(),
});

export const StoreChangeSchema = z.object({
  t: z.number(),
  name: z.string(),
  path: z.string(),
  before: jsonValue,
  after: jsonValue,
});

export const ConfidenceItemSchema = z.object({
  key: z.string(),
  level: z.enum(['ok', 'warn']),
  message: z.string(),
  hint: z.string().optional(),
});

export const TargetSchema = z.object({
  selector: z.string(),
  fallbackSelectors: z.array(z.string()).default([]),
  file: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  resolved: z.boolean(),
  resolution: z.enum(['exact', 'ancestor', 'unresolved']),
  resolutionReason: z.string().optional(),
  snippet: z
    .object({ startLine: z.number(), lines: z.array(z.string()), fileHash: z.string() })
    .optional(),
  componentStack: z.array(z.string()).default([]),
  props: jsonValue.optional(),
  state: jsonValue.optional(),
  computedStyle: z.record(z.string(), z.string()).optional(),
  html: z.string().optional(),
  text: z.string().optional(),
});

export const AssertionSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('target') }),
  z.object({ kind: z.literal('page') }),
  z.object({
    kind: z.literal('getByRole'),
    role: z.string(),
    name: z.union([z.string(), z.object({ regex: z.string(), flags: z.string().default('') })]).optional(),
  }),
  z.object({ kind: z.literal('getByText'), text: z.union([z.string(), z.object({ regex: z.string(), flags: z.string().default('') })]) }),
  z.object({ kind: z.literal('getByTestId'), testId: z.string() }),
  z.object({ kind: z.literal('getByLabel'), text: z.string() }),
  z.object({ kind: z.literal('locator'), selector: z.string() }),
]);

export const AssertionArgSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('string'), value: z.string() }),
  z.object({ type: z.literal('number'), value: z.number() }),
  z.object({ type: z.literal('regex'), source: z.string(), flags: z.string().default('') }),
]);

export const ASSERTION_MATCHERS = [
  'toHaveText',
  'toContainText',
  'toHaveValue',
  'toBeVisible',
  'toBeHidden',
  'toBeEnabled',
  'toBeDisabled',
  'toBeChecked',
  'toHaveAttribute',
  'toHaveClass',
  'toHaveCount',
  'toHaveCSS',
  'toHaveURL',
  'toHaveTitle',
] as const;

export const AssertionSchema = z.object({
  subject: AssertionSubjectSchema,
  matcher: z.enum(ASSERTION_MATCHERS),
  not: z.boolean().default(false),
  args: z.array(AssertionArgSchema).default([]),
});
export const AssertionIRSchema = z.array(AssertionSchema).min(1).max(10);

export const ReproRunSchema = z.object({
  id: z.string(),
  t: z.string(),
  status: z.enum(['passed', 'failed_assertion', 'error']),
  errorKind: z
    .enum([
      'precondition',
      'selector',
      'timeout',
      'server_down',
      'assertion_rejected',
      'playwright_missing',
      'browser_missing',
      'busy',
      'internal',
    ])
    .optional(),
  assertionIR: AssertionIRSchema,
  signature: z.string(),
  strict: z.boolean(),
  baseUrl: z.string(),
  usedStorageState: z.boolean(),
  unsafe: z.boolean().default(false),
  durationMs: z.number(),
  error: z.string().optional(),
  observed: z.object({ console: z.array(z.string()), network: z.array(z.string()) }),
  screenshotPath: z.string().optional(),
  syntheticInputs: z.array(z.string()).default([]),
  sideEffects: z.array(z.string()).default([]),
  repeat: z.number().optional(),
  mixed: z.boolean().optional(),
});

export const MessageSchema = z.object({
  from: z.enum(['agent', 'dev']),
  text: z.string().max(10_000),
  t: z.string(),
});

export const IncidentStatusSchema = z.enum(['open', 'fixed', 'fixed_unverified', 'cannot_reproduce']);

/** FR-BSK-05: grup kimliği biçimi (UTC). Sepetten birlikte gönderilen olaylar aynı grubu taşır. */
export const GROUP_ID_RE = /^grp-\d{8}-\d{6}-[a-z0-9]{4}$/;

/** Aynı oturumda sırayla kaydedilip birlikte gönderilen olaylar (FR-BSK-05). `index` 1'den başlar. */
export const IncidentGroupSchema = z.object({
  id: z.string().regex(GROUP_ID_RE),
  index: z.number().int().min(1),
  size: z.number().int().min(1),
});

/** Tarayıcının alıcıya POST ettiği yük. Sunucu kimlik, durum ve projectId alanlarını kendisi ekler. */
export const IncidentDraftSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  source: z.object({
    origin: z.string(),
    flashbackVersion: z.string(),
    framework: z.string().default('react'),
    userAgent: z.string(),
    tabId: z.string(),
  }),
  recordingStartedAt: z.string(),
  markedAtMs: z.number(),
  context: z.object({
    url: z.string(),
    startUrl: z.string(),
    viewport: z.object({ width: z.number(), height: z.number() }),
    locale: z.string(),
    timezone: z.string(),
    storageKeys: z.array(z.string()).default([]),
    cookieNames: z.array(z.string()).default([]),
  }),
  note: z.object({ what: z.string().optional(), expected: z.string().min(1) }),
  target: TargetSchema.nullable(),
  primaryEvidence: z.object({
    kind: z.enum(['target', 'network', 'console']),
    ref: z.number().optional(),
  }),
  steps: z.array(StepSchema).default([]),
  network: z.array(NetworkEntrySchema).default([]),
  console: z.array(ConsoleEntrySchema).default([]),
  store: z.array(StoreChangeSchema).default([]),
  domSnapshot: z.string().max(1_048_576).default(''),
  /** rrweb ham olayları (gizlenmiş). get_incident_events ile sunulur. */
  events: z.array(jsonValue).default([]),
  redaction: z.object({
    enabled: z.boolean(),
    count: z.number(),
    byType: z.record(z.string(), z.number()).default({}),
  }),
  confidence: z.array(ConfidenceItemSchema).default([]),
  group: IncidentGroupSchema.optional(),
});

export const IncidentSchema = IncidentDraftSchema.extend({
  id: z.string().regex(INCIDENT_ID_RE),
  projectId: z.string(),
  status: IncidentStatusSchema,
  pendingQuestion: z.boolean().default(false),
  createdAt: z.string(),
  repros: z.array(ReproRunSchema).default([]),
  messages: z.array(MessageSchema).default([]),
  /** Son yeniden açılma anı (FR-LIFE-06): doğrulama koşulu yalnızca bundan sonraki koşularla aranır. */
  reopenedAt: z.string().optional(),
  resolution: z
    .object({
      kind: z.enum(['fixed', 'cannot_reproduce']),
      summary: z.string(),
      reason: z.string().optional(),
      t: z.string(),
    })
    .optional(),
});

export type Step = z.infer<typeof StepSchema>;
export type NetworkEntry = z.infer<typeof NetworkEntrySchema>;
export type ConsoleEntry = z.infer<typeof ConsoleEntrySchema>;
export type StoreChange = z.infer<typeof StoreChangeSchema>;
export type ConfidenceItem = z.infer<typeof ConfidenceItemSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type Assertion = z.infer<typeof AssertionSchema>;
export type AssertionSubject = z.infer<typeof AssertionSubjectSchema>;
export type AssertionArg = z.infer<typeof AssertionArgSchema>;
export type AssertionIR = z.infer<typeof AssertionIRSchema>;
export type AssertionMatcher = (typeof ASSERTION_MATCHERS)[number];
export type ReproRun = z.infer<typeof ReproRunSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;
export type IncidentGroup = z.infer<typeof IncidentGroupSchema>;
export type IncidentDraft = z.infer<typeof IncidentDraftSchema>;
export type IncidentDraftInput = z.input<typeof IncidentDraftSchema>;
export type Incident = z.infer<typeof IncidentSchema>;

/** FR-PKG-05: JSON Schema 2020-12 çıktısı (schema/incident.v1.json üretimi için). */
export function incidentJsonSchema(): unknown {
  return z.toJSONSchema(IncidentSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
}
