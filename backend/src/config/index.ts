import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',

  ddb: {
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME     ?? 'congregation_db',
    user:     process.env.DB_USER     ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    max:      20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000,
    // Neon and most cloud Postgres providers require SSL
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
},


  jwt: {
    secret:             required('JWT_SECRET'),
    expiresIn:          process.env.JWT_EXPIRES_IN           ?? '4h',
    graduateExpiresIn:  process.env.JWT_GRADUATE_EXPIRES_IN  ?? '24h',
  },

  qr: {
    hmacSecret: required('QR_HMAC_SECRET'),
  },

  email: {
    host:     process.env.SMTP_HOST     ?? '',
    port:     parseInt(process.env.SMTP_PORT ?? '587', 10),
    user:     process.env.SMTP_USER     ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from:     process.env.EMAIL_FROM    ?? 'noreply@university.edu',
    // If host/user are empty, email.service.ts will log instead of sending
    enabled:  !!(process.env.SMTP_HOST && process.env.SMTP_USER),
  },

  app: {
    baseUrl:   process.env.APP_BASE_URL  ?? 'http://localhost:3000',
    portalUrl: process.env.PORTAL_URL    ?? 'http://localhost:5173',
  },

  // Maximum consecutive failed graduate login attempts before lockout
  auth: {
    maxLoginAttempts:    5,
    lockoutDurationMs:  15 * 60 * 1000,  // 15 minutes
  },

  rateLimit: {
    graduate: {
      windowMs: 15 * 60 * 1000,  // 15 minutes
      max: 5,
    },
    gateValidation: {
      windowMs: 60 * 1000,        // 1 minute
      max: 120,                   // ~2 scans/sec per device
    },
    general: {
      windowMs: 60 * 1000,
      max: 100,
    },
  },
} as const;
