import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getAccountProfileRepository, getAuthProvider } from "@/platform/composition/server";
import { getServerProviderConfig } from "@/platform/config/server";

import {
  localeCookieName,
  resolveLocaleState,
  type Locale,
  type RequestLocaleState,
} from "./config";

export const getRequestLocaleState = cache(async (): Promise<RequestLocaleState> => {
  const cookieStore = await cookies();
  const appRegion = getServerProviderConfig().appRegion;
  const browserLocale = cookieStore.get(localeCookieName)?.value;
  const browserState = resolveLocaleState({ appRegion, browserLocale });
  if (browserState.source === "browser") return browserState;

  try {
    const user = await getAuthProvider().getCurrentUser();
    if (!user) return browserState;

    const profile = await getAccountProfileRepository().getForCurrentUser();
    return resolveLocaleState({
      appRegion,
      browserLocale,
      profileLocale: profile?.preferredLocale,
    });
  } catch {
    return browserState;
  }
});

export const getRequestLocale = cache(
  async (): Promise<Locale> => (await getRequestLocaleState()).locale,
);
