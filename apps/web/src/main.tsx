import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Session, type SaveFile } from "./session";
import "./styles.css";

// Inside a claude.ai artifact the viewer may hot-swap a new build; hand the
// running game across so nobody loses a turn. Elsewhere `hot` is absent.
type Hot = { ready?: (start: (data: { save?: SaveFile }) => void) => void; snapshot?: (fn: () => unknown) => void; data?: { save?: SaveFile } };
const hot = (window as unknown as { claude?: { hot?: Hot } }).claude?.hot;

let current: Session | null = null;
hot?.snapshot?.(() => ({ save: current?.toSave() }));

function start(data: { save?: SaveFile }) {
  const session = (data?.save && Session.fromSave(data.save)) || Session.load();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App initial={session} onSession={(s) => (current = s)} />
    </StrictMode>,
  );
}

if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
