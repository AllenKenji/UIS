import { useEffect, useState } from "react";
import { api } from "../services/api";
import "./cfdp-survey-module.css";

const CFDP_DEFAULT_URL = "http://localhost:3001";

const CfdpSurveyModule = () => {
  const cfdpUrl = process.env.REACT_APP_CFDP_SURVEY_URL || CFDP_DEFAULT_URL;
  const [resolvedUrl, setResolvedUrl] = useState(cfdpUrl);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadHandoffUrl = async () => {
      try {
        const { data } = await api.post("/api/internal/cfdp/survey-handoff");
        if (!cancelled && data?.redirectUrl) {
          setResolvedUrl(data.redirectUrl);
          return;
        }
      } catch (error) {
        console.warn("Survey handoff unavailable, using direct CFDP URL:", error);
      }

      if (!cancelled) {
        setResolvedUrl(cfdpUrl);
      }
    };

    void loadHandoffUrl().finally(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cfdpUrl]);

  return (
    <section className="cfdp-module-page" aria-label="CFDP Survey System">
      <header className="cfdp-module-header">
        <div>
          <h2>CFDP Survey System</h2>
          <p>
            Embedded integration from BIS. Configure the source via
            REACT_APP_CFDP_SURVEY_URL.
          </p>
        </div>
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noreferrer"
          className="cfdp-open-tab-btn"
        >
          Open in New Tab
        </a>
      </header>

      <div className="cfdp-iframe-shell">
        {loading ? (
          <div className="cfdp-survey-loading">Preparing your survey session...</div>
        ) : (
          <iframe
            title="CFDP Survey System"
            src={resolvedUrl}
            className="cfdp-survey-iframe"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
    </section>
  );
};

export default CfdpSurveyModule;
