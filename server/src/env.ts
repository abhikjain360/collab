import { z } from "zod"

const envSchema = z.object({
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    ADMIN_PASSPHRASE: z.string().min(1, "ADMIN_PASSPHRASE is required"),
    PORT: z.coerce.number().default(3000),
    DATABASE_PATH: z.string().default("./data/collab.db"),
    CORS_ORIGIN: z.string().min(1, "CORS_ORIGIN is required"),
    TLS_CERT_PATH: z.string().optional(),
    TLS_KEY_PATH: z.string().optional(),
})

export const env = envSchema.parse(process.env)
