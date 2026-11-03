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

export function Cost({ cost, have, time }: { cost: Resources; have?: Resources; time?: number }) {
  return (
    <div className="cost">
      {content.resourceIds.map((r) =>
        (cost[r] ?? 0) > 0 ? (
          <span key={r} className={`cost__item${have && (have[r] ?? 0) + 1e-6 < (cost[r] ?? 0) ? " is-short" : ""}`}>
            <ResIcon id={r} size={16} />
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
          <UnitIcon id={u} size={28} />
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

export function Modal({ title, onClose, children, wide, eyebrow }: { title: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean; eyebrow?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? " modal--wide" : ""}`} role="dialog" aria-modal="true" tabIndex={-1} ref={ref}>
        <header className="modal__head">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 className="modal__title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
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

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{children}</span>
    </div>
  );
}

export function factionName(id: string) {
  return content.factions[id]?.name ?? id;
}

export function factionColor(id: string) {
  return content.factions[id]?.color ?? "#888";
}
