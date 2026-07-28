import { action } from "omkit";

export const build = action("build")
  .emits<{ progress: number }>()
  .ref<number>()
  .run(async () => 0);

export const lint = action("lint").run(async () => {});
