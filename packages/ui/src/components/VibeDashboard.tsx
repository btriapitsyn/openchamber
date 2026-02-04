import React, { useEffect, useState } from "react";
import { useThemeSystem } from "../contexts/useThemeSystem";
import { typography, getTypographyStyle } from "../lib/typography";

/**
 * 🛰️ Vibe Dashboard
 * Powered by Swarm Observability Sentinel & Vibe Polisher
 */
export const VibeDashboard = () => {
  const { currentTheme } = useThemeSystem();
  const [heartbeat, setHeartbeat] = useState<number>(0);
  const [status, setStatus] = useState("Synchronizing...");

  // Simulate Swarm Observability Sentinel Heartbeat
  useEffect(() => {
    const interval = setInterval(() => {
      setHeartbeat((prev) => prev + 1);
      if (heartbeat > 5) setStatus("Hive Mind: OPTIMAL 🟢");
    }, 2000);
    return () => clearInterval(interval);
  }, [heartbeat]);

  return (
    <div
      style={{
        backgroundColor: currentTheme.colors.surface.elevated,
        borderColor: currentTheme.colors.interactive.border,
        color: currentTheme.colors.surface.foreground,
        padding: "24px",
        borderRadius: "16px",
      }}
      className="border backdrop-blur-xl shadow-2xl max-w-lg mx-auto mt-10"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 style={getTypographyStyle("uiHeader")}>Swarm Dashboard</h2>
        <div
          style={{
            backgroundColor: currentTheme.colors.status.successBackground,
            color: currentTheme.colors.status.success,
            padding: "4px 12px",
            borderRadius: "9999px",
          }}
          className="text-xs font-bold"
        >
          {status}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Metric 1 */}
        <div
          style={{ backgroundColor: currentTheme.colors.surface.muted }}
          className="p-4 rounded-xl border border-white/5"
        >
          <p className="text-xs uppercase tracking-widest opacity-60">
            Heartbeats
          </p>
          <p style={getTypographyStyle("code.block")} className="text-2xl">
            {heartbeat}
          </p>
        </div>

        {/* Metric 2 */}
        <div
          style={{ backgroundColor: currentTheme.colors.surface.muted }}
          className="p-4 rounded-xl border border-white/5"
        >
          <p className="text-xs uppercase tracking-widest opacity-60">
            Intelligence
          </p>
          <p style={getTypographyStyle("code.block")} className="text-2xl">
            46 Skills
          </p>
        </div>
      </div>

      <div
        style={{
          backgroundColor: `${currentTheme.colors.status.infoBackground}33`,
          borderColor: `${currentTheme.colors.status.info}33`,
          color: currentTheme.colors.status.info,
        }}
        className="mt-6 p-4 rounded-lg border text-sm"
      >
        📡 Sentinel: Monitor active worktrees for logic loops... **OK**
      </div>

      <button
        style={{
          backgroundColor: currentTheme.colors.primary.base,
          color: currentTheme.colors.primary.foreground,
          padding: "12px",
          marginTop: "24px",
        }}
        className="w-full rounded-xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-lg"
      >
        Sync with Cockpit
      </button>
    </div>
  );
};
