import React from "react";
import { useThemeSystem } from "../contexts/useThemeSystem";
import { getTypographyStyle } from "../lib/typography";

/**
 * ✨ FIXED: This component now adheres to Maximum Vibe standards.
 * - Uses Theme Tokens
 * - Glassmorphism enabled
 * - Follows 4px spacing grid
 * - Typography consistency
 */
export const VibeTest = () => {
  const { currentTheme } = useThemeSystem();

  return (
    <div
      style={{
        backgroundColor: currentTheme.colors.surface.elevated,
        borderColor: currentTheme.colors.interactive.border,
        padding: "16px",
        margin: "8px",
      }}
      className="rounded-xl border backdrop-blur-md shadow-lg transition-all"
    >
      <h1
        style={{
          color: currentTheme.colors.surface.foreground,
          ...getTypographyStyle("uiHeader"),
        }}
      >
        Vibe Optimized
      </h1>

      <p
        style={{
          color: currentTheme.colors.surface.mutedForeground,
          ...getTypographyStyle("uiLabel"),
        }}
      >
        This component now uses semantic tokens and fits the design system
        perfectly.
      </p>

      <button
        style={{
          backgroundColor: currentTheme.colors.primary.base,
          color: currentTheme.colors.primary.foreground,
          marginTop: "16px",
          padding: "8px 24px",
        }}
        className="rounded-lg font-medium hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-md"
        onClick={() => alert("Vibe Check Passed")}
      >
        Click for Vibe Check
      </button>
    </div>
  );
};
