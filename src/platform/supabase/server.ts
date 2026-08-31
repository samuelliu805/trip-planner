import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/types/database";

import { getSupabaseConfig } from "./config";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { publishableKey, url } = getSupabaseConfig();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies. The request proxy refreshes them.
        }
      },
    },
  });
}
