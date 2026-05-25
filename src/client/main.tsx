import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";
import { getBrowserClerkPublishableKey, isBrowserLocalAuthBypassEnabled } from "./runtime-config";
import "./styles.css";

const clerkPublishableKey = getBrowserClerkPublishableKey();
const allowLocalAuthBypass = isBrowserLocalAuthBypassEnabled();

createRoot(document.getElementById("root")!).render(
  <PrymeiraAuthGate publishableKey={clerkPublishableKey} allowLocalAuthBypass={allowLocalAuthBypass}>
    <App />
  </PrymeiraAuthGate>
);
