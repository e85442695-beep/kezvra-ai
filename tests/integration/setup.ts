import "dotenv/config";
import { testDatabaseUrl } from "./global-setup";

// Must run before any app module reads env.
process.env.DATABASE_URL = testDatabaseUrl();
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6399"; // unreachable by default → code paths use their fallbacks
process.env.LOG_LEVEL = "silent";
process.env.OPENROUTER_API_KEY = "";
