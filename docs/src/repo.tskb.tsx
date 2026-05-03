import { type Folder } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      docs: Folder<{
        desc: "A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration.";
        path: "docs/";
      }>;
      packages: Folder<{
        desc: "A folder that contains independent packages in the repo (npm worskspace)";
        path: "packages";
      }>;
      references: Folder<{
        desc: "A folder that contains git tracked references used for documentation illustration purposes, referenced on npm";
        path: "references";
      }>;
    }
  }
}
