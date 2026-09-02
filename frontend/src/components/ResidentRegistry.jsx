import React, { useState } from "react";
import ResidentForm from "./forms/ResidentForm";
import ResidentList from "./lists/ResidentList";
import { useResidents } from "../hooks/useResidents";   
import { useOutletContext } from "react-router-dom";
import "../components/forms/resident-form.css";

const ResidentRegistry = () => {
  const [showForm, setShowForm] = useState(false);
  const { user } = useOutletContext();

  // 🔄 use custom hook for residents
  const { residents, loading, fetchResidents, updateResident, deleteResident } = useResidents();

  // 🆕 Handle new resident added
  const handleResidentAdded = async () => {
    await fetchResidents();
    setShowForm(false);
  };

  const handleCancel = () => setShowForm(false);

  // 🔑 Role flags
  const canAdd = user?.role === "staff" || user?.role === "admin";
  const canEdit = user?.role === "staff" || user?.role === "admin";
  const canDelete = user?.role === "admin";

  return (
    <div className="resident-registry">
      {showForm ? (
        <ResidentForm
          user={user}
          onResidentAdded={handleResidentAdded}
          onCancel={handleCancel}
        />
      ) : (
        <>
          <div className="registry-header">
            {canAdd && (
              <>
                <h2>Resident Registry</h2>
                <button onClick={() => setShowForm(true)}>➕ Add Resident</button>
              </>
            )}
          </div>

          <ResidentList
            residents={residents}
            loading={loading}
            canEdit={canEdit}
            canDelete={canDelete}
            onUpdate={updateResident}
            onDelete={deleteResident}
            fetchResidents={fetchResidents}
          />

          {!loading && residents.length === 0 && (
            <p className="empty-state">No residents found. Add the first one ➕</p>
          )}
        </>
      )}
    </div>
  );
};

export default ResidentRegistry;
