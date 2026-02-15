import { Doc, P, ref } from "tskb";

const PackageRoot = ref as tskb.Folders["TSKB.Package.Root"];
const CliFolder = ref as tskb.Folders["tskb.cli"];
const RuntimeFolder = ref as tskb.Folders["tskb.runtime"];
const JsxModule = ref as tskb.Modules["runtime.jsx"];
const RegistryModule = ref as tskb.Modules["runtime.registry"];
const SkillGenModule = ref as tskb.Modules["cli.utils.skill-generator"];
const CopilotGenModule = ref as tskb.Modules["cli.utils.copilot-instructions"];

export default (
  <Doc
    explains="Constraint: README.md must be updated when the public API or structural behavior changes"
    priority="constraint"
  >
    <P>
      The package in {PackageRoot} is published to npm. The README.md is the primary documentation
      users see on the registry. When structural changes are made to the consumer-facing surface —
      {CliFolder} commands, {JsxModule} components, {RegistryModule}, runtime primitives - $
      {RuntimeFolder}, type interfaces, build output format, or generated artifacts (
      {SkillGenModule}, {CopilotGenModule}) — the README.md in {PackageRoot} must be updated to
      reflect them.
    </P>
  </Doc>
);
