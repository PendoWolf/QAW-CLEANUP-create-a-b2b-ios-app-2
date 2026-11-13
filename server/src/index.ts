import express, { type Request } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

// Allow all origins by default; restrict via CORS_ORIGIN (comma-separated)
// for deployed environments where the web origin is known.
const corsOrigin = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());
app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));
app.use(express.json());

// In-memory state — intentionally simple so tests can assert exact values.
let counter = 0;
let lastAction = "none";

const state = () => ({ counter, lastAction });

// Pendo server-side Track Events. The integration key is read from the
// environment (never commit it); tracking is skipped when it isn't set.
const PENDO_DATA_HOST = process.env.PENDO_DATA_HOST || "data.pendo-dev.pendo-dev.com";
const PENDO_TRACK_EVENT_SECRET = process.env.PENDO_TRACK_EVENT_SECRET;

// The web client sends its Pendo visitor/account IDs as headers so server
// events attribute to the same visitor. Falls back to "system" when absent.
const headerId = (req: Request, name: string) => {
  const value = req.get(name)?.trim();
  return value ? value.slice(0, 128) : "system";
};

function pendoTrack(req: Request, event: string, properties: Record<string, unknown>) {
  if (!PENDO_TRACK_EVENT_SECRET) return;
  // Fire-and-forget: tracking failures must never affect the API response.
  fetch(`https://${PENDO_DATA_HOST}/data/track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-pendo-integration-key": PENDO_TRACK_EVENT_SECRET,
    },
    body: JSON.stringify({
      type: "track",
      event,
      visitorId: headerId(req, "x-visitor-id"),
      accountId: headerId(req, "x-account-id"),
      timestamp: Date.now(),
      properties,
      context: {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      },
    }),
  })
    .then((res) => {
      if (!res.ok) console.error(`Pendo track "${event}" failed: ${res.status}`);
    })
    .catch((err: unknown) => {
      console.error(`Pendo track "${event}" failed:`, err);
    });
}

app.get("/api/state", (_req, res) => {
  res.json(state());
});

app.post("/api/increment", (req, res) => {
  const previousCounter = counter;
  const previousAction = lastAction;
  counter += 1;
  lastAction = "increment";
  // Track Event: the increment was saved on the server.
  pendoTrack(req, "Counter incremented", {
    counter_value: counter,
    previous_counter_value: previousCounter,
    previous_action: previousAction,
  });
  res.json(state());
});

app.post("/api/decrement", (req, res) => {
  const previousCounter = counter;
  const previousAction = lastAction;
  counter -= 1;
  lastAction = "decrement";
  // Track Event: the decrement was saved on the server.
  pendoTrack(req, "Counter decremented", {
    counter_value: counter,
    previous_counter_value: previousCounter,
    previous_action: previousAction,
  });
  res.json(state());
});

app.post("/api/reset", (req, res) => {
  const previousCounter = counter;
  const previousAction = lastAction;
  counter = 0;
  lastAction = "reset";
  // Track Event: the reset was saved on the server.
  pendoTrack(req, "Counter reset", {
    counter_value: counter,
    previous_counter_value: previousCounter,
    previous_action: previousAction,
  });
  res.json(state());
});

// Serve the built SPA (after the API routes so it doesn't shadow /api/*).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(__dirname, "../../web/dist");
app.use(express.static(webDist));
app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});
