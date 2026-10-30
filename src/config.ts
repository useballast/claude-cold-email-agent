import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "Missing ANTHROPIC_API_KEY in .env"),
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-20241022"),
  BALLAST_API_KEY: z.string().min(1, "Missing BALLAST_API_KEY in .env"),
  BALLAST_MCP_URL: z.string().url().default("https://ballast.to/api/mcp"),
  SENDER_NAME: z.string().default("Alex"),
  SENDER_COMPANY: z.string().default("Ballast"),
  OFFER_SUMMARY: z
    .string()
    .default(
      "Cold email platform built for modern teams and AI agents: $19/mo for 20,000 emails, unlimited mailboxes, dedicated static IPs, and native MCP support."
    ),
  VALUE_ASSET_NAME: z
    .string()
    .default("2-minute Loom breakdown and setup teardown"),
});

export function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Configuration Error:\n${issues}\n\nPlease check your .env file or copy from .env.example.`
    );
  }
  return result.data;
}

export type AppConfig = ReturnType<typeof loadConfig>;

