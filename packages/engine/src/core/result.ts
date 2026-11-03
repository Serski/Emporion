// Commands never throw for a rule the player broke: they answer a Fail with a
// stable code (for the client to branch on) and a sentence (for the player).
// They do throw for programmer errors (a broken state, an impossible branch).

export type FailCode =
  | "not_found"
  | "not_owner"
  | "invalid"
  | "insufficient"
  | "queue_full"
  | "max_level"
  | "requirements"
  | "food"
  | "busy"
  | "no_troops"
  | "protected"
  | "culture"
  | "no_slot"
  | "no_merchants"
  | "storage";

export interface Fail {
  ok: false;
  code: FailCode;
  message: string;
}

export type Ok<T extends object = object> = { ok: true } & T;
export type Result<T extends object = object> = Ok<T> | Fail;

export function fail(code: FailCode, message: string): Fail {
  return { ok: false, code, message };
}

export function ok<T extends object>(value: T): Ok<T> {
  return { ok: true, ...value };
}
