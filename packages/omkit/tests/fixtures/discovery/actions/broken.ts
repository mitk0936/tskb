import { action } from "omkit";

// A deliberate type error: discovery must still report `flaky` and warn, not throw.
export const flaky = action("flaky").run(async (): Promise<number> => {
  const n: number = "not a number";
  return n;
});
