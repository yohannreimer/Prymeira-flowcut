import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";
import { FlowcutLandingPage } from "./FlowcutLandingPage";
import { FlowcutAccessDenied } from "./FlowcutAccessDenied";
import { getBrowserClerkPublishableKey, isBrowserLocalAuthBypassEnabled } from "./runtime-config";
import "./styles.css";

const clerkPublishableKey = getBrowserClerkPublishableKey();
const allowLocalAuthBypass = isBrowserLocalAuthBypassEnabled();

const { pathname } = window.location;

// Public preview routes
if (pathname === "/landing") {
  createRoot(document.getElementById("root")!).render(<FlowcutLandingPage />);
} else if (pathname === "/__preview_denied__") {
  createRoot(document.getElementById("root")!).render(
    <FlowcutAccessDenied decision={{ allowed: false, reason: "no_entitlement", product_key: "flowcut", status: "inactive" }} />
  );
} else if (pathname === "/__preview_error__") {
  createRoot(document.getElementById("root")!).render(
    <FlowcutAccessDenied error={new Error("Não foi possível verificar seu acesso. Tente novamente.")} />
  );
} else {
  createRoot(document.getElementById("root")!).render(
    <PrymeiraAuthGate publishableKey={clerkPublishableKey} allowLocalAuthBypass={allowLocalAuthBypass}>
      <App />
    </PrymeiraAuthGate>
  );
}
