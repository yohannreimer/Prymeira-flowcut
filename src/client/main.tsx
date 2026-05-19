import { createRoot } from "react-dom/client";
import { App } from "./App";
import { PrymeiraAuthGate } from "./PrymeiraAuthGate";
import "./styles.css";

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
const clerkPublishableKey = env?.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")!).render(
  <PrymeiraAuthGate publishableKey={clerkPublishableKey}>
    <App />
  </PrymeiraAuthGate>
);
