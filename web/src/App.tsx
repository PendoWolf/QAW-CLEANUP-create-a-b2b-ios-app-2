import { useEffect, useState } from "react";
import { api, BASE, HttpError, type AppState } from "./api";

// The actions the UI can run. Each success is reported as `demo-<action>`.
type Action = "load" | "increment" | "decrement" | "reset" | "refresh";

// Seam for Pendo. Novus installs the Pendo agent, which provides window.pendo
// at runtime; this fires a Track Event for each action. No-op when the agent
// isn't present (local dev), so the app and Playwright mocks both stay simple.
function trackEvent(name: Action | "action-failed", props: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    try {
      window.pendo?.track?.(`demo-${name}`, props);
    } catch {
      // Analytics must never break the app or turn a success into a failure.
    }
  }
}

// Properties for each `demo-<action>` event. `previous` is the state on screen
// when the action started; `next` is the state the server returned. The server
// keeps one counter shared by every visitor, so counters are global values.
function successProps(action: Action, previous: AppState, next: AppState) {
  switch (action) {
    case "load":
      return { counter: next.counter, lastAction: next.lastAction };
    case "increment":
    case "decrement":
      return { counter: next.counter, previousCounter: previous.counter };
    case "reset":
      // The counter is always 0 after a reset, so only the prior state matters.
      return { previousCounter: previous.counter, previousLastAction: previous.lastAction };
    case "refresh":
      return {
        counter: next.counter,
        lastAction: next.lastAction,
        previousCounter: previous.counter,
        counterChanged: next.counter !== previous.counter,
      };
  }
}

// Properties for `demo-action-failed`. errorName tells network failures
// (TypeError), non-2xx responses (HttpError, with httpStatus) and invalid JSON
// (SyntaxError) apart.
function failureProps(action: Action, e: unknown) {
  const err = e instanceof Error ? e : new Error(String(e));
  return {
    action,
    errorName: err.name,
    errorMessage: err.message.slice(0, 200),
    ...(err instanceof HttpError ? { httpStatus: err.status } : {}),
    apiBaseUrl: BASE,
  };
}

// React StrictMode runs the mount effect (and so the initial load) twice in
// development. Only the first load per page is reported, so demo-load, or a
// failed load, is counted once per page view.
let initialLoadReported = false;

export default function App() {
  const [state, setState] = useState<AppState>({ counter: 0, lastAction: "none" });
  const [error, setError] = useState<string | null>(null);

  const run = async (name: Action, fn: () => Promise<AppState>) => {
    // The state on screen when the action started, for the "previous" props.
    const previous = state;
    const shouldTrack = name !== "load" || !initialLoadReported;
    if (name === "load") initialLoadReported = true;
    try {
      setError(null);
      const next = await fn();
      setState(next);
      if (shouldTrack) trackEvent(name, successProps(name, previous, next));
    } catch (e) {
      setError((e as Error).message);
      if (shouldTrack) trackEvent("action-failed", failureProps(name, e));
    }
  };

  useEffect(() => {
    run("load", api.getState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
      <h1>QAWolf Demo</h1>

      <p data-testid="counter-value" style={{ fontSize: "3rem", margin: "1rem 0" }}>
        {state.counter}
      </p>
      <p data-testid="last-action" style={{ color: "#666" }}>
        Last action: {state.lastAction}
      </p>

      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
        <button data-testid="btn-increment" onClick={() => run("increment", api.increment)}>
          Increment
        </button>
        <button data-testid="btn-decrement" onClick={() => run("decrement", api.decrement)}>
          Decrement
        </button>
        <button data-testid="btn-reset" onClick={() => run("reset", api.reset)}>
          Reset
        </button>
        <button data-testid="btn-refresh" onClick={() => run("refresh", api.getState)}>
          Refresh
        </button>
      </div>

      {error && (
        <p data-testid="error" style={{ color: "crimson", marginTop: 16 }}>
          {error}
        </p>
      )}
    </main>
  );
}
