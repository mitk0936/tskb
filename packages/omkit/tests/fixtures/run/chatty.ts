import { om } from "../../../src/index.ts";

/** A run that talks as much as a real build does — thousands of lines in well under a second. */
om("chatty").run(async () => {
  for (let i = 0; i < 1500; i++) console.log(`build: compiled module ${i}`);
});
