import { useEffect, useState } from "react";
import { ReportingAPI } from "../services/api";

export const useDocumentCounters = () => {
  const [counters, setCounters] = useState([]);

  useEffect(() => {
    let isCurrent = true;

    const loadCounters = async () => {
      try {
        const counters = await ReportingAPI.listCounters();
        if (isCurrent) setCounters(counters);
      } catch (error) {
        console.error("Unable to load document counters:", error);
      }
    };

    loadCounters();
    const intervalId = window.setInterval(loadCounters, 30000);

    return () => {
      isCurrent = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return counters;
};
