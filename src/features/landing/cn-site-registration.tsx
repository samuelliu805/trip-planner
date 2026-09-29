import type { AppRegion } from "@/platform/config/provider-matrix";

import "./cn-site-registration.css";

export function CnSiteRegistration({ appRegion }: { appRegion: AppRegion }) {
  if (appRegion !== "cn") return null;
  return (
    <div className="cn-site-registration">
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" target="_blank">
        沪ICP备2026049500号
      </a>
    </div>
  );
}
