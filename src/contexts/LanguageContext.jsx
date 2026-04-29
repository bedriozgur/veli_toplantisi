import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { t } from "../i18n/messages";

const LanguageContext = createContext(null);
const LANGUAGE_KEY = "portal_lang";

function readLanguage() {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === "tr" ? "tr" : "en";
  } catch {
    return "en";
  }
}

function writeLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {}
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(readLanguage);

  useEffect(() => {
    writeLanguage(language);
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key) => t(language, key),
    }),
    [language]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}
