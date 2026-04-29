import React from "react";
import { useLanguage } from "../contexts/LanguageContext";

export default function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === "tr" ? "en" : "tr")}
      style={styles.button}
      type="button"
    >
      {language === "tr" ? "EN" : "TR"}
    </button>
  );
}

const styles = {
  button: {
    position: "absolute",
    top: 16,
    right: 16,
    background: "rgba(17,24,39,0.08)",
    color: "#111827",
    border: "1px solid rgba(17,24,39,0.14)",
    borderRadius: 999,
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    zIndex: 10,
  },
};
