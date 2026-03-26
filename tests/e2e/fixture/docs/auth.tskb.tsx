import { Doc, H1, P, Snippet, Relation, ref } from "tskb";
import { AuthService } from "../src/services/auth.service.js";

const AuthServiceExport = ref as tskb.Exports["AuthService"];
const ServicesFolder = ref as tskb.Folders["services"];
const Jwt = ref as tskb.Terms["jwt"];
const Rbac = ref as tskb.Terms["rbac"];

export default (
  <Doc
    explains="Authentication: JWT-based login, registration, and token refresh"
    priority="essential"
  >
    <H1>Authentication</H1>

    <P>
      {AuthServiceExport} in {ServicesFolder} handles user authentication using {Jwt}. Access is
      controlled via {Rbac} — users have roles that determine permissions.
    </P>

    <Snippet
      code={async () => {
        const auth: AuthService = new AuthService();
        const result = await auth.login("user@example.com", "password");
        return result.tokens.accessToken;
      }}
    />

    <Relation from={AuthServiceExport} to={Jwt} label="uses" />
  </Doc>
);
