export function InsertRowIcon({
  className = "size-4 shrink-0 sm:size-3.5",
  direction,
}: {
  className?: string;
  direction: "above" | "below";
}) {
  return direction === "above" ? (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M12 3V9M9 6H15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M5 13H19M5 17H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
    </svg>
  ) : (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5 7H19M5 11H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.75" />
      <path d="M12 15V21M9 18H15" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
