import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";
import { getBrowserClerkPublishableKey } from "./runtime-config";
import "./styles.css";

const clerkPublishableKey = getBrowserClerkPublishableKey();

createRoot(document.getElementById("root")!).render(
  <PrymeiraAuthGate publishableKey={clerkPublishableKey}>
    <App />
  </PrymeiraAuthGate>
);
