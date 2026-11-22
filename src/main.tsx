import React from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/lib/store";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user" transition={{ duration: 0.25, ease: [0.22, 0.61, 0.36, 1] }}>
      <TooltipProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </TooltipProvider>
    </MotionConfig>
  </React.StrictMode>,
);
