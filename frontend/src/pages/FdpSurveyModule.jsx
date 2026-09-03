import { useEffect, useState } from "react";
import { api } from "../services/api";
import "./fdp-survey-module.css";

const FDP_DEFAULT_URL = "http://localhost:3001";

const FdpSurveyModule = () => {
  const fdpUrl = import.meta.env.VITE_FDP_SURVEY_URL || FDP_DEFAULT_URL;
  const [resolvedUrl, setResolvedUrl] = useState(fdpUrl);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadHandoffUrl = async () => {
      try {
        const { data } = await api.post("/api/internal/fdp/survey-handoff");
        if (!cancelled && data?.redirectUrl) {
          setResolvedUrl(data.redirectUrl);
          return;
        }
      } catch (error) {
        console.warn("Survey handoff unavailable, using direct FDP URL:", error);
      }

      if (!cancelled) {
        setResolvedUrl(fdpUrl);
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
  }, [fdpUrl]);

  return (
    <section className="fdp-module-page" aria-label="FDP Survey System">
      <header className="fdp-module-header">
        <div>
          <h2>FDP Survey System</h2>
          <p>
            Embedded integration from BIS. Configure the source via
            VITE_FDP_SURVEY_URL.
          </p>
        </div>
        <a
          href={resolvedUrl}
          target="_blank"
          rel="noreferrer"
          className="fdp-open-tab-btn"
        >
          Open in New Tab
        </a>
      </header>

      <div className="fdp-iframe-shell">
        {loading ? (
          <div className="fdp-survey-loading">Preparing your survey session...</div>
        ) : (
          <iframe
            title="FDP Survey System"
            src={resolvedUrl}
            className="fdp-survey-iframe"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-read; clipboard-write"
          />
        )}
      </div>
    </section>
  );
};

export default FdpSurveyModule;
