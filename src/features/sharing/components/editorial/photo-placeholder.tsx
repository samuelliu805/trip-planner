/** A paper postcard sketch. CSS owns motion, including reduced-motion and failure states. */
export function PhotoPlaceholder() {
  return (
    <div className="edition-photo-placeholder" aria-hidden="true">
      <div className="edition-photo-loading-art">
        <svg viewBox="0 0 120 88" focusable="false">
          <rect x="8" y="8" width="104" height="72" rx="3" />
          <circle cx="82" cy="29" r="9" />
          <path d="M15 65 43 37 67 60 82 46 105 65 M15 72H105" />
        </svg>
        <span className="edition-photo-loading-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
