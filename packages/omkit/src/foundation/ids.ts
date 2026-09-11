import { createHash, randomUUID } from "node:crypto";
import { fsSafe } from "./fsSafe.ts";

/** A fresh v4 uuid for a node. */
export const newUuid = (): string => randomUUID();

/** The short form used in ids/paths — first 8 hex of the uuid. */
export const shortId = (uuid: string): string => uuid.slice(0, 8);

/**
 * How much of a name an id keeps. A node's name is free text and can be long — a `command`
 * node is named after its whole command line — while the id it seeds ends up inside a file
 * path, where Windows still stops at 260 characters for the whole path.
 */
const MAX_NAME_IN_ID = 64;

/**
 * A node's id: `${name}_${shortId}` → `chromePage_9f3c`. The root passes its own
 * plain name (`main`) and skips this.
 *
 * The name is sanitised **here**, at the point the id is made, because an id is a path
 * segment everywhere it is used: node paths join ids with `/`, and log file names are those
 * paths mapped onto directories. A name carrying its own separators — `command("npx tsk
 * ./docs/**\/*.tsx …")` is an ordinary one — is then indistinguishable from tree nesting, and
 * one action's log went nine directories deep, spelling out the command's path arguments as
 * real folders. Sanitising downstream cannot fix that: by the time a joined path is split
 * back into segments, the separator that came from a name and the one that came from the tree
 * are the same character.
 *
 * Uniqueness never depended on the name — that is the uuid's job — so truncating is safe and
 * the readable form survives anyway: nodes are displayed by their `name`, not by their id.
 */
export const makeId = (name: string, uuid: string): string =>
  `${clip(fsSafe(name))}_${shortId(uuid)}`;

/** Trim to the cap, then drop any separator the cut left dangling. */
const clip = (name: string): string => name.slice(0, MAX_NAME_IN_ID).replace(/[-_.]+$/, "");

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
