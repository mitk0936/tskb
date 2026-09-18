import { om } from "../../../../src/index.ts";

om("registers-then-throws")
  .mcp()
  .run(async () => {});

// The file blows up *after* its om registered. Two things must hold: the registration
// already went up the channel (they stream, they are not batched at exit), and the import
// failure degrades to a warning rather than taking discovery down.
throw new Error("this file explodes at import");
