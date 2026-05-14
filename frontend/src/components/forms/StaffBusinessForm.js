import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, collection, addDoc } from "firebase/firestore";
import { auth, db } from "../../services/firebase";
import { PARANAQUE } from "../../data/locations";
import { usePublicFees } from "../../hooks/usePublicFees";
import { useResidents } from "../../hooks/useResidents";
import { NotificationsAPI } from "../../services/api";
import PaymentForm from "./PaymentForm"; 
import "./business-form.css";

const getDisplayName = (profile = {}, fallbackEmail = "") => {
  const firstLast = [profile.firstName || profile.first_name, profile.lastName || profile.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    profile.fullName ||
    profile.full_name ||
    profile.name ||
    firstLast ||
    fallbackEmail
  );
};

const StaffBusinessForm = ({ onBusinessAdded, onCancel }) => {
  const { register, handleSubmit, trigger, reset } = useForm();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [docId, setDocId] = useState(null);
  const [businessId, setBusinessId] = useState(null);

  const { businessTypes: businessFees } = usePublicFees();
  const { residents, loading: residentsLoading } = useResidents();
  const [currentStaff, setCurrentStaff] = useState(null);

  const [selectedResident, setSelectedResident] = useState(null);
  const [selectedFee, setSelectedFee] = useState(0);
  const [selectedBusinessType, setSelectedBusinessType] = useState("");
  const [submittedBusinessName, setSubmittedBusinessName] = useState("");

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

  // 🔧 Custom ID Generators
  const generateBusinessId = (barangay) => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `BIZ-${barangay?.toUpperCase()}-${year}-${random}`;
  };

  const generatePermitNumber = (barangay) => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `PERMIT-${year}-${barangay?.toUpperCase()}-${random}`;
  };

  const onSubmit = async (data) => {
    const feeObj = businessFees.find(bt => bt.businessType === data.businessType);

    if (!selectedResident) {
      toast.error("⚠️ Please select a resident.");
      return;
    }
    if (!currentStaff) {
      toast.error("⚠️ Staff profile not loaded yet. Please wait.");
      return;
    }

    setIsSubmitting(true);
    try {
      const customBusinessId = generateBusinessId(data.barangay);
      const staffEmail = currentStaff.email || auth.currentUser?.email || "";
      const staffName = getDisplayName(currentStaff, staffEmail) || "Unknown Staff";

      const payload = {
        ...data,
        ownerName: selectedResident.fullName,
        contactNumber: selectedResident.contactNumber,
        email: selectedResident.email || "",
        status: "approved",
        businessId: customBusinessId,
        permitNumber: generatePermitNumber(data.barangay),
        submittedAt: new Date().toISOString(),
        createdBy: {
          uid: currentStaff.uid || auth.currentUser?.uid || "",
          name: staffName,
          email: staffEmail,
        },
      };

      const docRef = await addDoc(collection(db, "businesses"), payload);

      await NotificationsAPI.createBusinessSubmitted(
        selectedResident.fullName || selectedResident.name || selectedResident.email || "Resident",
        data.businessName
      ).catch((notifyError) => {
        console.warn("⚠️ Business registration notification failed:", notifyError);
      });

      await NotificationsAPI.createBusinessStatusUpdate(
        "approved",
        null,
        data.businessName,
        customBusinessId,
        docRef.id
      ).catch((notifyError) => {
        console.warn("⚠️ Business owner notification failed:", notifyError);
      });

      setDocId(docRef.id);
      setBusinessId(customBusinessId);

      toast.success(`✅ Business registered for ${selectedResident.fullName}`);
      reset();
      onBusinessAdded?.();

      setSubmittedBusinessName(data.businessName);
      setStep(4);
      setSelectedFee(feeObj?.registrationTotal || 0);
      setSelectedBusinessType(data.businessType);
    } catch (error) {
      console.error("❌ Error registering business:", error);
      toast.error("❌ Failed to register business.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    else navigate("/businesses");
  };

  return (
    <form className="business-form" onSubmit={handleSubmit(onSubmit)}>
      {step === 1 && (
        <div className="form-step">
          <h2>👤 Select Resident</h2>
          {residentsLoading ? (
            <p>Loading residents…</p>
          ) : (
            <select
              value={selectedResident?.id || ""}
              onChange={(e) =>
                setSelectedResident(residents.find((r) => r.id === e.target.value))
              }
            >
              <option value="">Select Resident</option>
              {residents.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.fullName} — {r.address.barangay}
                </option>
              ))}
            </select>
          )}

          <h2>🏢 Business Details</h2>

          <label>Business Name
            <input {...register("businessName", { required: true })} />
          </label>

          <label>Business Type
            <select {...register("businessType", { required: true })}>
              <option value="">Select Type</option>
              {businessFees.map((bt) => (
                <option key={bt.id} value={bt.businessType}>
                  {bt.businessType} — ₱{bt.registrationTotal}
                </option>
              ))}
            </select>
          </label>

          {/* Grouped Business Address */}
          <fieldset className="address-fieldset">
            <legend>Business Address</legend>

            <label>Street
              <input {...register("street", { required: true })} />
            </label>

            <label>Barangay
              <select {...register("barangay", { required: true })}>
                <option value="">Select Barangay</option>
                {PARANAQUE.barangays.map((brgy) => (
                  <option key={brgy} value={brgy}>{brgy}</option>
                ))}
              </select>
            </label>

            <label>City
              <input value={PARANAQUE.city} readOnly {...register("city")} />
            </label>

            <label>Province
              <input value={PARANAQUE.province} readOnly {...register("province")} />
            </label>
          </fieldset>

          <label>Registration Date
            <input type="date" {...register("registrationDate", { required: true })} />
          </label>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={async () => {
              const valid = await trigger([
                "businessName",
                "businessType",
                "street",
                "barangay",
                "city",
                "province",
                "registrationDate",
              ]);
              if (valid && selectedResident) handleSubmit(onSubmit)();
              else toast.error("⚠️ Please select a resident and fill in all required fields.");
            }}
          >
            {isSubmitting ? "Registering…" : "Register Business →"}
          </button>

        </div>
      )}

      {step === 4 && docId && businessId && (
        <PaymentForm
          docId={docId}                     // Firestore UID
          entityId={businessId}             // use generated businessId for backend payment lookup
          entityType="business"
          resident={selectedResident}
          entityCategory={selectedBusinessType}
          fee={selectedFee}
          businessId={businessId}       // ✅ use generated custom ID
          businessName={submittedBusinessName} // ✅ pass business name for receipt
          onCancel={handleCancel}
        />
      )}
    </form>
  );
};

export default StaffBusinessForm;
