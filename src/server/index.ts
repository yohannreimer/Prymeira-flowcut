import { config as loadDotenv } from "dotenv";
import { createApp } from "./app";

if (process.env.NODE_ENV !== "production") {
  loadDotenv({ path: ".env.local" });
}
loadDotenv();

export function resolvePort(rawPort = process.env.PORT) {
  if (rawPort === undefined || rawPort === "") {
    return 4317;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${rawPort}". Expected an integer from 1 to 65535.`);
  }

  return port;
}

const port = resolvePort();
const app = createApp();

app.listen(port, () => {
  console.log(`Flowcut API listening on http://localhost:${port}`);
});
