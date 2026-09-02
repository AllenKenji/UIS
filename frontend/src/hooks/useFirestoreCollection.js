import { useEffect, useState } from "react";
import { YouthEventsAPI, YouthFeedbackAPI, YouthProgramsAPI } from "../services/api";

/**
 * REST-backed loader for migrated youth collections.
 * @param {string} collectionName - Collection name retained for call-site compatibility
 * @returns {Array} documents - Array of { id, ...data }
 */
export const useFirestoreCollection = (collectionName) => {
  const [documents, setDocuments] = useState([]);

  useEffect(() => {
    const collectionApis = {
      sk_programs: YouthProgramsAPI,
      sk_events: YouthEventsAPI,
      youth_feedback: YouthFeedbackAPI,
    };
    const collectionApi = collectionApis[collectionName];
    if (!collectionApi) {
      setDocuments([]);
      return undefined;
    }

    let active = true;
    const load = async () => {
      try {
        const records = await collectionApi.list();
        if (active) setDocuments(records);
      } catch (error) {
        console.error(`Failed to load ${collectionName}`, error);
      }
    };

    load();
    window.addEventListener("youth-data-changed", load);

    return () => {
      active = false;
      window.removeEventListener("youth-data-changed", load);
    };
  }, [collectionName]);

  return documents;
};
