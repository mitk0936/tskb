import { createHash, randomUUID } from "node:crypto";

/** A fresh v4 uuid for a node. */
export const newUuid = (): string => randomUUID();

/** The short form used in ids/paths — first 8 hex of the uuid. */
export const shortId = (uuid: string): string => uuid.slice(0, 8);

/**
 * A node's id: `${name}_${shortId}` → `chromePage_9f3c`. The root passes its own
 * plain name (`main`) and skips this.
 */
export const makeId = (name: string, uuid: string): string => `${name}_${shortId(uuid)}`;

/**
 * A run's stable identity: first 8 hex of sha256 over the defining file's absolute
 * path + the om name. Same file + name ⇒ same hash on every run; the same name
 * defined in two different files diverges (consumers may define oms in same-named
 * files across folders). With no file (no stack), the name alone still hashes
 * deterministically.
 */
export const omHash = (name: string, file?: string): string =>
  createHash("sha256")
    .update(`${file ?? ""}\0${name}`)
    .digest("hex")
    .slice(0, 8);
