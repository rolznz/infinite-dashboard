export function Logo(props: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinejoin="round"
      aria-hidden
      className={props.className}
    >
      <rect x="6" y="19" width="27" height="26" rx="7" />
      <rect x="31" y="19" width="27" height="26" rx="7" />
    </svg>
  );
}
