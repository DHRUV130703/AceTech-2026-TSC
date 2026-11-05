// TODO(brand): replace with the official logo SVG from the brand team (public/brand/logo.svg).
export function Logo() {
  return (
    <div className="flex items-center gap-3 text-white" aria-label="The Sleep Company" role="img">
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden="true">
        <rect x="2" y="2" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3.5" />
        <rect x="13" y="13" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="3.5" />
      </svg>
      <span className="text-[17px] leading-[1.05] font-extrabold tracking-wide uppercase" aria-hidden="true">
        The Sleep
        <br />
        Company
      </span>
    </div>
  );
}
