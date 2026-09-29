import "./site-registration.css";

// The official registration identifier stays identical across locales.
const icpRegistrationNumber = "沪ICP备2026049500号-1";

export function SiteRegistration() {
  return (
    <div className="site-registration">
      <a href="https://beian.miit.gov.cn/" rel="noopener noreferrer" target="_blank">
        {icpRegistrationNumber}
      </a>
    </div>
  );
}
