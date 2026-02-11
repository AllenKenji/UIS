import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { auth, db } from "../../services/firebase";
import { doc, updateDoc, getDoc, collection, addDoc } from "firebase/firestore";
import ReceiptPreview from "../staff/ReceiptPreview";

const PaymentForm = ({ 
  docId, 
  entityId,        // businessId or documentId
  entityType,      // "business" or "document"
  resident, 
  description,     // businessType or documentType
  fee, 
  onCancel,
  onPaymentCompleted,
  customEntityId
}) => {
  const { register, handleSubmit } = useForm();
  const [receiptData, setReceiptData] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStaff, setCurrentStaff] = useState(null);

  useEffect(() => {
    const fetchStaffProfile = async () => {
      if (!auth.currentUser) return;
      const ref = doc(db, "users", auth.currentUser.uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        setCurrentStaff({ ...snap.data(), uid: auth.currentUser.uid });
      }
    };
    fetchStaffProfile();
  }, []);

  const generatePaymentId = () => `PAY-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
  const generateReceiptId = () => `REC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

  const onSubmit = async (data) => {
    if (!resident || !currentStaff || !docId || !entityId) {
      toast.error("⚠️ Missing required data.");
      return;
    }

    setIsSubmitting(true);
    try {
      const customPaymentId = generatePaymentId();
      const customReceiptId = generateReceiptId();

      // ✅ Save payment record
      const paymentPayload = {
        customPaymentId,
        entityId,
        entityType,
        residentId: resident.id,          // ✅ consistent with backend
        residentName: resident.fullName,  // ✅ consistent with backend
        description,
        amount: Number(fee) || 0,
        method: data.method,
        status: "approved",
        paymentStatus: "paid",
        receiptNumber: customReceiptId,
        createdAt: new Date().toISOString(),
        processedBy: currentStaff.full_name,
        barangay: resident?.address?.barangay || "Barangay",
      };
      const paymentRef = await addDoc(collection(db, "payments"), paymentPayload);

      // ✅ Save receipt record
      const receiptPayload = {
        customReceiptId,
        receiptNumber: customReceiptId,
        paymentId: paymentRef.id,
        entityId,
        entityType,
        residentId: resident.id,          // ✅ consistent
        residentName: resident.fullName,  // ✅ consistent
        description,
        amount: Number(fee) || 0,
        method: data.method,
        issuedAt: new Date().toISOString(),
        verified: true,
        processedBy: currentStaff.full_name,
        barangay: resident?.address?.barangay || "Barangay",
        customEntityId: customEntityId || null,
      };
      const receiptRef = await addDoc(collection(db, "receipts"), receiptPayload);

      // ✅ Update parent entity (document or business)
      await updateDoc(doc(db, entityType === "business" ? "businesses" : "documents", docId), {
        status: entityType === "business" ? "approved" : "paid",
        paymentStatus: "paid",
        updatedAt: new Date().toISOString(),
        approvedAt: entityType === "business" ? new Date().toISOString() : null,
      });

      toast.success(`💵 Payment recorded. Receipt #: ${customReceiptId}`);
      setReceiptData({ ...receiptPayload, firestoreId: receiptRef.id });

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
      <p>{entityType === "business" ? "Business Type" : "Document Type"}: {description}</p>
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
          <ReceiptPreview receiptData={receiptData} />

          <button 
            type="button" 
            className="print-btn"
            onClick={() => {
              const printWindow = window.open("", "_blank");
              if (printWindow) {
                printWindow.document.write(`
                  <html>
                    <head><title>Receipt</title></head>
                    <body>
                      <pre>${JSON.stringify(receiptData, null, 2)}</pre>
                    </body>
                  </html>
                `);
                printWindow.document.close();
                printWindow.focus();
                printWindow.print();
              }
            }}
          >
            🖨️ Print Receipt
          </button>

          <button 
            type="button" 
            className="proceed-btn"
            onClick={onPaymentCompleted}
          >
            ➡️ Proceed to Issue Document
          </button>
        </>
      )}
    </div>
  );
};

export default PaymentForm;
