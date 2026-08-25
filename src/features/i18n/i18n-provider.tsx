"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { persistLocale } from "./actions";
import { localeCookieName, type Locale } from "./config";
import { translateMessage, type TranslationValues } from "./translate";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale, persist?: boolean) => void;
  t: (message: string, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const localizedAttributeNames = ["alt", "aria-label", "placeholder", "title"] as const;
const observedAttributeNames = [
  ...localizedAttributeNames,
  ...localizedAttributeNames.map((attribute) => `data-i18n-${attribute}`),
];

function syncLocalizedAttributes(root: ParentNode, locale: Locale) {
  const nodes = [
    ...(root instanceof Element ? [root] : []),
    ...root.querySelectorAll<Element>(
      "[data-i18n-alt],[data-i18n-aria-label],[data-i18n-placeholder],[data-i18n-title]",
    ),
  ];
  for (const node of nodes) {
    for (const attribute of localizedAttributeNames) {
      const message = node.getAttribute(`data-i18n-${attribute}`);
      if (message !== null) {
        const translated = translateMessage(locale, message);
        if (node.getAttribute(attribute) !== translated) node.setAttribute(attribute, translated);
      }
    }
  }
}

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocaleState] = useState(initialLocale);
  const localizedAttributesReady = useRef(false);

  useEffect(() => {
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof Element) {
          syncLocalizedAttributes(record.target, locale);
        } else if (record.type === "childList") {
          for (const node of record.addedNodes)
            if (node instanceof Element) syncLocalizedAttributes(node, locale);
            else if (record.target instanceof Element)
              syncLocalizedAttributes(record.target, locale);
        }
      }
    });
    const startSync = () => {
      syncLocalizedAttributes(document, locale);
      observer.observe(document.body, {
        attributeFilter: observedAttributeNames,
        attributes: true,
        childList: true,
        subtree: true,
      });
      localizedAttributesReady.current = true;
    };
    let initialSync: number | undefined;
    if (localizedAttributesReady.current) startSync();
    else initialSync = window.setTimeout(startSync, 1_000);
    return () => {
      if (initialSync !== undefined) window.clearTimeout(initialSync);
      observer.disconnect();
    };
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale, shouldPersist = true) => {
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    if (shouldPersist) {
      document.cookie = `${localeCookieName}=${encodeURIComponent(nextLocale)}; Path=/; Max-Age=31536000; SameSite=Lax`;
      startTransition(() => void persistLocale(nextLocale));
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (message, values) => translateMessage(locale, message, values),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider.");
  return context;
}

export function T({ message, values }: { message: string; values?: TranslationValues }) {
  const { t } = useI18n();
  return <>{t(message, values)}</>;
}

export function Localized({ value }: { value: ReactNode }) {
  return typeof value === "string" ? <T message={value} /> : <>{value}</>;
}
