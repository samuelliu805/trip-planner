import { tripPlannerBrandName } from "./brand";

import "./site-registration.css";

// The official registration identifier stays identical across locales.
const icpRegistrationNumber = "沪ICP备2026049500号-1";

export function SiteRegistration({ year }: { year: number }) {
  return (
    <p className="site-registration">
      <span>
        © {year} {tripPlannerBrandName}
      </span>
      <span aria-hidden="true">｜</span>
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" target="_blank">
        {icpRegistrationNumber}
      </a>
    </p>
  );
}
