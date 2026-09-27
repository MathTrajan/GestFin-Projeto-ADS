/** @type {import('tailwindcss').Config} */
// cores referenciam variáveis em canais RGB (ver styles.css :root e .dark) -> habilita dark mode + opacidade
const c = (v) => `rgb(var(${v}) / <alpha-value>)`;
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        bg: c("--c-bg"),
        bg2: c("--c-bg2"),
        bgSoft: c("--c-bg2"),
        surface: c("--c-surface"),
        surface2: c("--c-surface2"),
        surfaceHi: c("--c-surface2"),
        surfaceLift: c("--c-surface2"),
        panel: c("--c-surface"),
        line: c("--c-line"),
        lineStrong: c("--c-line-strong"),
        lineHi: c("--c-line-strong"),
        lineBright: c("--c-line-strong"),
        ink: c("--c-ink"),
        inkSoft: c("--c-ink-soft"),
        inkMuted: c("--c-ink-muted"),
        inkFaint: c("--c-ink-faint"),
        inkGhost: c("--c-ink-faint"),
        brand: c("--c-brand"),
        brandDeep: c("--c-brand-deep"),
        brandTint: c("--c-brand-tint"),
        pos: c("--c-pos"),
        posTint: c("--c-pos-tint"),
        posSoft: c("--c-pos-tint"),
        neg: c("--c-neg"),
        negTint: c("--c-neg-tint"),
        negSoft: c("--c-neg-tint"),
        invest: c("--c-invest"),
        investTint: c("--c-invest-tint"),
        investSoft: c("--c-invest-tint"),
        gold: c("--c-gold"),
        goldSoft: c("--c-gold-tint"),
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      // Cantos retos de sistema de gestão: nada acima de 10px.
      borderRadius: { sm: "4px", md: "6px", lg: "8px", xl: "10px" },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,42,0.05)",
        lift: "0 2px 6px rgba(15,23,42,0.09)",
        soft: "0 1px 3px rgba(15,23,42,0.07)",
      },
    },
  },
  plugins: [],
};
