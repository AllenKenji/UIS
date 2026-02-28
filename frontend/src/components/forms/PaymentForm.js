import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { auth, db } from "../../services/firebase";
import { doc, getDoc } from "firebase/firestore";
import ReceiptPreview from "../staff/ReceiptPreview";
import "../../styles/staff/payment_form.css";

const PaymentForm = ({
  entityId,        // businessId or documentId
  entityType,      // "business" or "document"
  resident,
  entityCategory,
  fee,
  onCancel,
  onPaymentCompleted,
  businessName,
  description,
  customEntityId,
}) => {
  const { register, handleSubmit } = useForm();
  const [receiptData, setReceiptData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStaff, setCurrentStaff] = useState(null);
  const [generatePDF, setGeneratePDF] = useState(null);

  useEffect(() => {
    const fetchStaffProfile = async () => {
      try {
        if (!auth.currentUser) return;
        const ref = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setCurrentStaff({ ...snap.data(), uid: auth.currentUser.uid });
        }
      } catch (err) {
        console.error("⚠️ Failed to fetch staff profile:", err);
      }
    };
    fetchStaffProfile();
  }, []);


  const onSubmit = async (data) => {
    if (!resident || !currentStaff || !entityId) {
      toast.error("⚠️ Missing required data.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 🔹 Choose endpoint dynamically
      const url =
        entityType === "business"
          ? "/api/paymongo/payments/business"
          : "/api/paymongo/payments/document";

      const payload =
        entityType === "business"
          ? {
              businessId: entityId,
              businessName: data.businessName || businessName,
              amount: fee,
              method: data.method,
              processedBy: currentStaff.full_name || currentStaff.fullName,
            }
          : {
              documentId: entityId,
              documentName: customEntityId,
              docType: entityCategory,
              amount: fee,
              method: data.method,
              processedBy: currentStaff.full_name || currentStaff.fullName,
              residentName: resident.fullName,
            };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let result;
      try {
        result = await response.json();
      } catch {
        const text = await response.text();
        throw new Error(text);
      }

      console.log("Backend result:", result);

      if (result.success) {
        toast.success(`💵 Payment recorded. Receipt #: ${result.receiptNumber}`);

        const receiptBase = {
          receiptNumber: result.receiptNumber,
          residentName: resident.fullName,
          amount: fee,
          method: data.method,
          processedBy: currentStaff.full_name || currentStaff.fullName,
          issuedAt: new Date().toISOString(),
          entityType,
        };

        const receiptData =
          entityType === "business"
            ? {
                ...receiptBase,
                businessId: result.businessId,
                businessName: result.businessName,
                ownerName: result.ownerName,
                businessType: result.businessType,
                barangay: result.barangay,
                description: result.businessType,
              }
            : {
                ...receiptBase,
                entityId: result.documentId, // Firestore ID 
                customEntityId: customEntityId, // sequential ID 
                documentType: result.documentType, 
                barangay: result.barangay, 
                description: result.documentType,
              };

        setReceiptData(receiptData);
      } else {
        toast.error(`❌ Failed to record payment: ${result.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("❌ Error recording payment:", error);
      toast.error("❌ Failed to record payment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="form-step">
      <h2>💵 Record Payment</h2>
      <p>Resident: {resident?.fullName}</p>
      <p>{entityType === "business" ? "Business Type" : "Document Type"}: {entityCategory}</p>
      <p>Fee: ₱{fee}</p>

      {!receiptData ? (
        <>
          <label>
            Payment Method
            <select {...register("method", { required: true })}>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="card">Card</option>
            </select>
          </label>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" disabled={isSubmitting} onClick={handleSubmit(onSubmit)}>
            {isSubmitting ? "Recording…" : "Record Payment"}
          </button>
        </>
      ) : (
        <>
          <ReceiptPreview receiptData={receiptData} onGeneratePDF={setGeneratePDF} />

          <div className="action-buttons">
            <button
              type="button"
              className="print-btn"
              onClick={() => {
                if (generatePDF) generatePDF();
              }}
            >
              🖨️ Print Receipt
            </button>

            {entityType === "document" ? (
              <>
                <button type="button" className="proceed-btn" onClick={onPaymentCompleted}>
                  ➡️ Proceed to Issue Document
                </button>
                <button type="button" className="close-btn" onClick={onCancel}>
                  ✖️ Close
                </button>
              </>
            ) : (
              <button type="button" className="close-btn" onClick={onCancel}>
                ✖️ Close
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PaymentForm;
