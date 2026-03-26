import { Doc, H1, P, ref } from "tskb";

const Api = ref as tskb.Folders["api"];
const Services = ref as tskb.Folders["services"];

export default (
  <Doc explains="Service isolation: services must not import from API layer" priority="constraint">
    <H1>Service Isolation Constraint</H1>

    <P>
      Modules in {Services} must never import from {Api}. The dependency direction is strictly API →
      Services, never the reverse.
    </P>
  </Doc>
);
