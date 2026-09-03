"use client";

import { CloudBaseBrowserStorageProvider } from "@/platform/cloudbase/browser-storage-provider";
import { CloudBaseBrowserPhoneOtpProvider } from "@/platform/cloudbase/browser-phone-otp-provider";
import type { BrowserPhoneOtpProvider } from "@/platform/contracts/auth";
import type { BrowserStorageProvider } from "@/platform/contracts/storage";

export function getBrowserPhoneOtpProvider(): BrowserPhoneOtpProvider {
  return new CloudBaseBrowserPhoneOtpProvider();
}

export function getBrowserStorageProvider(bucket: string): BrowserStorageProvider {
  return new CloudBaseBrowserStorageProvider(bucket);
}
