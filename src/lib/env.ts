import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z.object({
  DATABASE_PATH: z.string().default("./data/tracker.db"),
  APP_URL: z.string().default("http://localhost:3000"),
  APP_PASSWORD: optionalString,

  BASE_CURRENCY: z.string().length(3).default("DKK"),
  FX_API_URL: z.string().default("https://api.frankfurter.dev/v1"),

  CHECK_INTERVAL_HOURS: z.coerce.number().positive().default(6),
  CHECK_JITTER_MINUTES: z.coerce.number().min(0).default(30),
  DOMAIN_MIN_DELAY_SECONDS: z.coerce.number().min(0).default(20),
  SANITY_RECHECK_MINUTES: z.coerce.number().min(0).default(5),
  PLAYWRIGHT_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === undefined || v === "" || v === "true" || v === "1"),

  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,

  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  ALERT_EMAIL_FROM: optionalString,
  ALERT_EMAIL_TO: optionalString,
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated config. Read lazily so tests can set process.env first. */
export function env(): Env {
  if (!cached) cached = schema.parse(process.env);
  return cached;
}

export function geminiConfigured(): boolean {
  const e = env();
  return Boolean(e.GEMINI_API_KEY && e.GEMINI_MODEL);
}
