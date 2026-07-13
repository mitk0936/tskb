import { randomUUID } from "node:crypto";

/** A fresh v4 uuid for a node. */
export const newUuid = (): string => randomUUID();

/** The short form used in ids/paths — first 8 hex of the uuid. */
export const shortId = (uuid: string): string => uuid.slice(0, 8);

/**
 * A node's id: `${name}_${shortId}` → `chromePage_9f3c`. The root passes its own
 * plain name (`main`) and skips this.
 */
export const makeId = (name: string, uuid: string): string => `${name}_${shortId(uuid)}`;
