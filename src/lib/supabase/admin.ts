import "server-only";

/** @deprecated Phase 1 compatibility export. Admin secrets stay inside the platform adapter. */
export { createSupabaseAdminClient as createAdminClient } from "@/platform/supabase/admin";
