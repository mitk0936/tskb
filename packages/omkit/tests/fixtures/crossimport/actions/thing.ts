import { action } from "omkit";

export const thing = action("thing")
  .ref<number>()
  .run(async ({ attach }) => {
    attach(1);
  });
