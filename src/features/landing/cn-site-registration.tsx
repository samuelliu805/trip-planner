import type { AppRegion } from "@/platform/config/provider-matrix";

import "./cn-site-registration.css";

// The official registration identifier stays identical across locales.
const cnIcpRegistrationNumber = "沪ICP备2026049500号";

export function CnSiteRegistration({ appRegion }: { appRegion: AppRegion }) {
  if (appRegion !== "cn") return null;
  return (
    <div className="cn-site-registration">
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" target="_blank">
        {cnIcpRegistrationNumber}
      </a>
    </div>
  );
}
