import "./cfdp-survey-module.css";

const CFDP_DEFAULT_URL = "http://localhost:3001";

const CfdpSurveyModule = () => {
  const cfdpUrl = process.env.REACT_APP_CFDP_SURVEY_URL || CFDP_DEFAULT_URL;

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
          href={cfdpUrl}
          target="_blank"
          rel="noreferrer"
          className="cfdp-open-tab-btn"
        >
          Open in New Tab
        </a>
      </header>

      <div className="cfdp-iframe-shell">
        <iframe
          title="CFDP Survey System"
          src={cfdpUrl}
          className="cfdp-survey-iframe"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </section>
  );
};

export default CfdpSurveyModule;
