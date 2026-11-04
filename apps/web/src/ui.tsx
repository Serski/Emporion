import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import type { Resources, Troops } from "@emporion/engine";
import { asset, content } from "./content";
import { duration, int } from "./format";
import type { Session } from "./session";

export const SessionContext = createContext<Session | null>(null);

// Re-render on every game tick or command.
export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("no session");
  useSyncExternalStore(s.subscribe, s.getVersion);
  return s;
}

export const art = (name: string) => `art/${name}.webp`;
export const portraitUrl = (stem: string) => `portraits/${stem}.webp`;

export function ResIcon({ id, size = 20 }: { id: string; size?: number }) {
  const def = content.resources.find((r) => r.id === id);
  if (def?.icon?.endsWith(".webp")) return <img className="res-icon" src={asset(def.icon)} width={size} height={size} alt={def.name} title={def.name} />;
  return <span className="res-icon res-icon--text">{def?.name[0] ?? "?"}</span>;
}

export function UnitIcon({ id, size = 40 }: { id: string; size?: number }) {
  const unit = content.units[id];
  if (unit?.icon) return <img className="unit-icon" src={asset(unit.icon)} width={size} height={size} alt="" />;
  const initials = (unit?.name ?? "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
  return (
    <span className="unit-icon unit-icon--drawn" style={{ width: size, height: size, fontSize: size * 0.34 }} aria-hidden>
      {initials}
    </span>
  );
}

// A face in MASSALIA's manner: a painted portrait in a bronze ring.
export function Portrait({ stem, size = 64, alt = "", dim }: { stem: string | null; size?: number; alt?: string; dim?: boolean }) {
  return (
    <span className={`portrait${dim ? " is-dim" : ""}`} style={{ width: size, height: size }}>
      {stem ? <img src={portraitUrl(stem)} width={size} height={size} alt={alt} /> : <span className="portrait__blank" aria-hidden />}
    </span>
  );
}

export function Band() {
  return <div className="band" aria-hidden />;
}

export function Cost({ cost, have, time }: { cost: Resources; have?: Resources; time?: number }) {
  return (
    <div className="cost">
      {content.resourceIds.map((r) =>
        (cost[r] ?? 0) > 0 ? (
          <span key={r} className={`cost__item${have && (have[r] ?? 0) + 1e-6 < (cost[r] ?? 0) ? " is-short" : ""}`}>
            <ResIcon id={r} size={18} />
            {int(cost[r] ?? 0)}
          </span>
        ) : null,
      )}
      {time !== undefined && <span className="cost__item cost__time">⧗ {duration(time)}</span>}
    </div>
  );
}

export function TroopList({ troops, empty = "None" }: { troops: Troops; empty?: string }) {
  const rows = Object.entries(troops).filter(([, n]) => n > 0);
  if (rows.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="troops">
      {rows.map(([u, n]) => (
        <li key={u} title={content.units[u]?.name}>
          <UnitIcon id={u} size={30} />
          <span className="troops__n">{int(n)}</span>
          <span className="troops__name">{content.units[u]?.plural ?? content.units[u]?.name ?? u}</span>
        </li>
      ))}
    </ul>
  );
}

export function Countdown({ to, now }: { to: number; now: number }) {
  return <span className="countdown">{duration(to - now)}</span>;
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

export function Tabs<T extends string>({ tabs, value, onChange, variant = "main" }: { tabs: TabDef<T>[]; value: T; onChange: (t: T) => void; variant?: "main" | "sub" }) {
  return (
    <div className={variant === "main" ? "tabs" : "subtabs"} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? "is-on" : undefined} onClick={() => onChange(t.id)}>
          {variant === "main" && <span className="tabs__dot" aria-hidden>•</span>}
          {t.label}
          {t.badge ? <span className="badge">{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

// A window: eyebrow and title on a dark plaque, a Greek-key band, an optional
// painted banner, then the body.
export function Modal({
  title,
  onClose,
  children,
  wide,
  eyebrow,
  banner,
  image,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  eyebrow?: ReactNode;
  banner?: string;
  image?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal--wide" : ""}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <header className="modal__head">
          {image && <img className="modal__image" src={image} alt="" width={64} height={64} />}
          <div className="modal__titles">
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 className="modal__title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <Band />
        {banner && <img className="modal__banner" src={banner} alt="" />}
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

export function Bar({ value, max, tone }: { value: number; max: number; tone?: "good" | "warn" | "danger" | "accent" }) {
  const w = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className={`bar bar--${tone ?? "accent"}`}>
      <span className="bar__fill" style={{ width: `${w * 100}%` }} />
    </span>
  );
}

export function Stat({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat__value">{children}</span>
      <span className="stat__label">{label}</span>
      {note && <span className="stat__note">{note}</span>}
    </div>
  );
}

export function factionName(id: string) {
  return content.factions[id]?.name ?? id;
}

export function factionColor(id: string) {
  return content.factions[id]?.color ?? "#888";
}
