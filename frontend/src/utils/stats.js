// utils/stats.js
export const computePaymentStats = (documents = []) => {
  let paid = 0;
  let awaiting_payment = 0;

  documents.forEach((doc) => {
    const amount = doc.amount || 0;
    const status = doc.status || doc.documentStatus;

    // Free documents (amount = 0) are considered paid
    if (amount === 0) {
      paid += 1;
      return;
    }

    // Otherwise, check status
    if (status === "paid" || status === "approved") {
      paid += 1;
    } else if (status === "awaiting_payment" || status === "pending") {
      awaiting_payment += 1;
    }
  });

  return { paid, awaiting_payment };
};
