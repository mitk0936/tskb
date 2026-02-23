import { Folder } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      docs: Folder<{
        desc: "A folder that contains all the repo docs (.tskb.tsx) files. Uses its own ts configuration.";
        path: "docs/";
      }>;
      "examples.taskflow-app": Folder<{
        desc: "Example application, not meant to be run, but used as reference for example docs";
        path: "examples/taskflow-app";
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
