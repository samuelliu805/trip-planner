import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

import type { Locale } from "@/features/i18n/config";

export function formatShareImageExpiry(expiresAt: string, locale: Locale = "en") {
  return locale === "zh-CN"
    ? format(parseISO(expiresAt), "yyyy年M月d日", { locale: zhCN })
    : format(parseISO(expiresAt), "MMM d, yyyy");
}
