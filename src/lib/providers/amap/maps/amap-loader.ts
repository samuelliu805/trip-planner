"use client";

import type { AmapBrowserWindow, AmapNamespace } from "../sdk-types.ts";

const amapScriptBase = "https://webapi.amap.com/maps";

type LoaderState = {
  apiKey: string;
  disposeTimer?: ReturnType<typeof setTimeout>;
  previousSecurityConfig?: { serviceHost: string };
  promise: Promise<AmapNamespace>;
  references: number;
  reject: (error: Error) => void;
  script: HTMLScriptElement;
  serviceHost: string;
  status: "pending" | "resolved";
};

type AcquireOptions = {
  apiKey: string;
  document?: Document;
  serviceHost: string;
  window?: AmapBrowserWindow;
};

export type AmapLoaderLease = {
  load: Promise<AmapNamespace>;
  release(): void;
};

function scriptUrl(apiKey: string) {
  const url = new URL(amapScriptBase);
  url.searchParams.set("v", "2.0");
  url.searchParams.set("key", apiKey);
  return url.toString();
}

export function createAmapJsApiLoader() {
  let state: LoaderState | null = null;

  function restoreSecurityConfig(targetWindow: AmapBrowserWindow, target: LoaderState) {
    if (target.previousSecurityConfig) {
      targetWindow._AMapSecurityConfig = target.previousSecurityConfig;
    } else if (targetWindow._AMapSecurityConfig?.serviceHost === target.serviceHost) {
      delete targetWindow._AMapSecurityConfig;
    }
  }

  function disposePending(targetWindow: AmapBrowserWindow, target: LoaderState, reason: string) {
    if (state !== target || target.status !== "pending") return;
    target.script.onload = null;
    target.script.onerror = null;
    target.script.remove();
    restoreSecurityConfig(targetWindow, target);
    state = null;
    target.reject(new Error(reason));
  }

  return {
    acquire(options: AcquireOptions): AmapLoaderLease {
      const targetDocument = options.document ?? document;
      const targetWindow = options.window ?? (window as AmapBrowserWindow);
      const apiKey = options.apiKey.trim();
      const serviceHost = options.serviceHost.trim();
      if (!apiKey || !serviceHost)
        return {
          load: Promise.reject(new Error("AMap JS API configuration is incomplete.")),
          release() {},
        };

      if (targetWindow.AMap) {
        targetWindow._AMapSecurityConfig = { serviceHost };
        return { load: Promise.resolve(targetWindow.AMap), release() {} };
      }

      if (state && (state.apiKey !== apiKey || state.serviceHost !== serviceHost)) {
        return {
          load: Promise.reject(new Error("AMap JS API was requested with conflicting settings.")),
          release() {},
        };
      }

      if (!state) {
        const script = targetDocument.createElement("script");
        script.async = true;
        script.dataset.amapLoader = "true";
        script.src = scriptUrl(apiKey);
        let resolveLoad: (amap: AmapNamespace) => void = () => undefined;
        let rejectLoad: (error: Error) => void = () => undefined;
        const promise = new Promise<AmapNamespace>((resolve, reject) => {
          resolveLoad = resolve;
          rejectLoad = reject;
        });
        const created: LoaderState = {
          apiKey,
          previousSecurityConfig: targetWindow._AMapSecurityConfig,
          promise,
          references: 0,
          reject: rejectLoad,
          script,
          serviceHost,
          status: "pending",
        };
        state = created;
        targetWindow._AMapSecurityConfig = { serviceHost };
        script.onload = () => {
          if (state !== created) return;
          if (!targetWindow.AMap) {
            disposePending(targetWindow, created, "AMap JS API loaded without its global API.");
            return;
          }
          created.status = "resolved";
          script.onload = null;
          script.onerror = null;
          resolveLoad(targetWindow.AMap);
        };
        script.onerror = () =>
          disposePending(targetWindow, created, "AMap JS API could not be loaded.");
        targetDocument.head.append(script);
      }

      const leaseState = state;
      leaseState.references += 1;
      if (leaseState.disposeTimer) {
        clearTimeout(leaseState.disposeTimer);
        leaseState.disposeTimer = undefined;
      }
      let released = false;
      return {
        load: leaseState.promise,
        release() {
          if (released) return;
          released = true;
          leaseState.references = Math.max(0, leaseState.references - 1);
          if (leaseState.references || leaseState.status === "resolved") return;
          leaseState.disposeTimer = setTimeout(() => {
            leaseState.disposeTimer = undefined;
            if (!leaseState.references)
              disposePending(targetWindow, leaseState, "AMap JS API loading was cancelled.");
          }, 0);
        },
      };
    },
  };
}

export const amapJsApiLoader = createAmapJsApiLoader();
