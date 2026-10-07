// Server-only. The site runs in one of two modes:
//   live    = Google sign-in and the Supabase database are both set up (see .env.example)
//   preview = nothing is connected yet; "sign in" works on this browser only and entries are saved in this browser
// Add the settings in Vercel and the site switches to live by itself.
import { isConfigured } from "./auth/config";
import { dbConfigured } from "./db";

export const previewMode = (): boolean => !(isConfigured() && dbConfigured());

export { PREVIEW_COOKIE } from "./preview/constants";
