import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <ErrorBoundary
        fallback={<div className="p-8 text-center">Something broke. Please reload the page.</div>}
      >
        <App />
      </ErrorBoundary>
      <Toaster position="bottom-center" />
    </TooltipProvider>
  </StrictMode>,
);
