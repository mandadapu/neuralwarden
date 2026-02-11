export default function Sidebar() {
  return (
    <aside className="w-[250px] min-w-[250px] min-h-screen bg-sidebar text-gray-400 text-sm flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple-400 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <span className="text-white text-base font-bold tracking-tight">NeuralWarden</span>
      </div>

      {/* Account selector */}
      <div className="mx-3 mb-4 px-3 py-2.5 bg-white/5 rounded-lg flex items-center justify-between cursor-pointer">
        <span className="text-[#c4c4d4] text-[13px] font-medium">Security Pipeline v2</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {/* Primary nav */}
      <nav className="px-2 space-y-0.5">
        <NavItem icon={<GridIcon />} label="Feed" active />
        <NavItem icon={<ClockIcon />} label="Snoozed" />
        <NavItem icon={<XIcon />} label="Ignored" badge="0" />
        <NavItem icon={<CheckIcon />} label="Solved" />
      </nav>

      <Divider />

      <nav className="px-2">
        <NavItem icon={<WrenchIcon />} label="AutoFix" />
      </nav>

      <Divider />

      {/* Resources */}
      <nav className="px-2 space-y-0.5">
        <NavItem icon={<BoxIcon />} label="Log Sources" count="4" />
        <NavItem icon={<ServerIcon />} label="Agents" count="6" />
        <NavItem icon={<SunIcon />} label="MITRE ATT&CK" count="1" />
        <NavItem icon={<ShieldIcon />} label="Threat Intel" count="1" />
      </nav>

      <Divider />

      {/* Bottom nav */}
      <nav className="px-2 pb-5 space-y-0.5">
        <NavItem icon={<FileIcon />} label="Reports" />
        <NavItem icon={<SearchIcon />} label="Pentests" />
        <NavItem icon={<LayoutIcon />} label="Integrations" />
      </nav>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  badge,
  count,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  badge?: string;
  count?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg cursor-pointer ${
        active ? "bg-primary/[.18] text-white font-semibold" : "text-[#8b8fa3] hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {icon}
        {label}
      </div>
      {badge !== undefined && (
        <span className="bg-primary text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{badge}</span>
      )}
      {count !== undefined && (
        <span className="bg-white/10 text-[#8b8fa3] text-[11px] font-semibold px-1.5 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-white/[.08] mx-3 my-3.5" />;
}

/* Mini SVG icons */
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function WrenchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}
function ServerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
    </svg>
  );
}
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}
function LayoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}
