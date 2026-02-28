import { useState, useCallback } from "react";
import { sendEmail } from "../services/email";

export function useEmail() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const triggerEmail = useCallback(async (payload) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await sendEmail(payload);
      setResult(res);
      return res;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { triggerEmail, loading, error, result };
}
