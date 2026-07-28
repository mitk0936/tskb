/** Zero-pad a number to `width` digits (e.g. `pad(7) → "07"`). */
export const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** A date as `YYYY-MM-DD`. */
export const ymd = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A clock time as `HH<sep>MM<sep>SS` (`-` for filesystem-safe folder names). */
export const hms = (d: Date, sep = ":"): string =>
  `${pad(d.getHours())}${sep}${pad(d.getMinutes())}${sep}${pad(d.getSeconds())}`;

/** Render a value for the timeline: strings inline, everything else as JSON. */
export const renderValue = (v: unknown): string => {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
