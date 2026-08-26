export type WechatShareMode = "copy-link" | "desktop-qr" | "native-share" | "wechat-menu";

export function resolveWechatShareMode({
  canNativeShare,
  isMobile,
  isWechatBrowser,
}: {
  canNativeShare: boolean;
  isMobile: boolean;
  isWechatBrowser: boolean;
}): WechatShareMode {
  if (isWechatBrowser) return "wechat-menu";
  if (!isMobile) return "desktop-qr";
  return canNativeShare ? "native-share" : "copy-link";
}
