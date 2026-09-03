import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { PARANAQUE } from "../../data/locations";
import { usePublicFees } from "../../hooks/usePublicFees";
import { useResidents } from "../../hooks/useResidents";
import { BusinessesAPI, NotificationsAPI, PublicServicesAPI } from "../../services/api";
import { useUser } from "../../context/UserContext";
import PaymentForm from "./PaymentForm";
import ResidentPicker from "./ResidentPicker";
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
  const { register, handleSubmit, trigger, reset, setValue, setError, formState: { errors } } = useForm();
  const navigate = useNavigate();
  const { userInfo } = useUser();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [docId, setDocId] = useState(null);
  const [businessId, setBusinessId] = useState(null);

  const { businessTypes: businessFees } = usePublicFees(userInfo?.barangayId);
  const { residents: allResidents, loading: residentsLoading } = useResidents();
  // Same filter as SecretaryDocumentForm's walk-in resident picker: only
  // exclude residents still pending/rejected verification, not ones with no
  // verificationStatus at all (staff-entered, or predating the field).
  const residents = allResidents.filter(
    (r) => r.verificationStatus !== "pending" && r.verificationStatus !== "rejected"
  );
  const [selectedResident, setSelectedResident] = useState(null);
  const [selectedFee, setSelectedFee] = useState(0);
  const [selectedBusinessType, setSelectedBusinessType] = useState("");
  const [submittedBusinessName, setSubmittedBusinessName] = useState("");
  const [residentTouched, setResidentTouched] = useState(false);

  // Staff already operate within their own barangay (their account's
  // barangayId) — no reason to make them re-pick it from a Parañaque-wide
  // list, same fix as the resident-facing BusinessForm.
  const [tenant, setTenant] = useState(null);
  useEffect(() => {
    if (!userInfo?.barangayId) return;
    PublicServicesAPI.getTenant(userInfo.barangayId)
      .then((data) => {
        setTenant(data);
        setValue("barangay", data?.barangay || "", { shouldValidate: true });
      })
      .catch(() => setTenant(null));
  }, [userInfo?.barangayId, setValue]);

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
    if (!userInfo) {
      toast.error("⚠️ Staff profile not loaded yet. Please wait.");
      return;
    }

    setIsSubmitting(true);
    try {
      const customBusinessId = generateBusinessId(data.barangay);
      const staffEmail = userInfo.email || "";
      const staffName = getDisplayName(userInfo, staffEmail) || "Unknown Staff";
      const fullAddress = [data.street, data.barangay, data.city, data.province]
        .filter(Boolean)
        .join(", ");

      const payload = {
        ...data,
        address: fullAddress,
        ownerUid: selectedResident.uid || selectedResident.id,
        ownerName: selectedResident.fullName,
        contactNumber: selectedResident.contactNumber,
        email: selectedResident.email || "",
        status: "approved",
        businessId: customBusinessId,
        permitNumber: generatePermitNumber(data.barangay),
        submittedAt: new Date().toISOString(),
        createdBy: {
          uid: userInfo.uid || "",
          name: staffName,
          email: staffEmail,
        },
      };

      const createdBusiness = await BusinessesAPI.create(payload);

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
        createdBusiness.id
      ).catch((notifyError) => {
        console.warn("⚠️ Business owner notification failed:", notifyError);
      });

      setDocId(createdBusiness.id);
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
      // handleError (services/api.js) extracts a specific, readable message
      // onto error.message (e.g. duplicate business name) — show that
      // instead of a generic failure when we have it.
      toast.error(error?.status ? `❌ ${error.message}` : "❌ Failed to register business.");
      if (error?.status === 409) {
        setError("businessName", { type: "manual", message: error.message });
      }
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
            <div className={residentTouched && !selectedResident ? "input-error" : ""}>
              <ResidentPicker
                id="resident_id"
                residents={residents}
                value={selectedResident?.id || ""}
                onChange={(residentId) =>
                  setSelectedResident(residents.find((r) => r.id === residentId) || null)
                }
              />
            </div>
          )}
          {residentTouched && !selectedResident && <span className="error-text">Please select a resident</span>}

          <h2>🏢 Business Details</h2>

          <label htmlFor="businessName">Business Name
            <input
              id="businessName"
              className={errors.businessName ? "input-error" : ""}
              {...register("businessName", { required: "Business name is required" })}
            />
            {errors.businessName && <span className="error-text">{errors.businessName.message}</span>}
          </label>

          <label htmlFor="isFranchise" className="checkbox-label">
            <input id="isFranchise" type="checkbox" {...register("isFranchise")} />
            This is a franchise or branch of an existing business
            <span className="field-hint">
              Check this if another branch already uses this business name in this barangay.
            </span>
          </label>

          <label htmlFor="businessType">Business Type
            <select
              id="businessType"
              className={errors.businessType ? "input-error" : ""}
              {...register("businessType", { required: "Business type is required" })}
            >
              <option value="">Select Type</option>
              {businessFees.map((bt) => (
                <option key={bt.id} value={bt.businessType}>
                  {bt.businessType} — ₱{bt.registrationTotal}
                </option>
              ))}
            </select>
            {errors.businessType && <span className="error-text">{errors.businessType.message}</span>}
          </label>

          {/* Grouped Business Address */}
          <fieldset className="address-fieldset">
            <legend>Business Address</legend>

            <label htmlFor="street">Street
              <input
                id="street"
                className={errors.street ? "input-error" : ""}
                {...register("street", { required: "Street is required" })}
              />
              {errors.street && <span className="error-text">{errors.street.message}</span>}
            </label>

            <label htmlFor="barangay">Barangay
              <input
                id="barangay"
                value={tenant?.barangay || ""}
                readOnly
                placeholder={tenant ? "" : "Loading barangay…"}
                className={errors.barangay ? "input-error" : ""}
                {...register("barangay", { required: "Barangay is required" })}
              />
              {errors.barangay && <span className="error-text">{errors.barangay.message}</span>}
            </label>

            <label htmlFor="city">City
              <input id="city" value={PARANAQUE.city} readOnly {...register("city")} />
            </label>

            <label htmlFor="province">Province
              <input id="province" value={PARANAQUE.province} readOnly {...register("province")} />
            </label>
          </fieldset>

          <label htmlFor="registrationDate">Registration Date
            <input
              id="registrationDate"
              type="date"
              className={errors.registrationDate ? "input-error" : ""}
              {...register("registrationDate", { required: "Registration date is required" })}
            />
            {errors.registrationDate && <span className="error-text">{errors.registrationDate.message}</span>}
          </label>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={async () => {
              setResidentTouched(true);
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
