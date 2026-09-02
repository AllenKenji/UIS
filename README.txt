BIS/
├── backend/                        # Python backend 
│   ├── __init__.py          
│   ├── app/
│   │   ├── core/                   # PostgreSQL, local auth, storage, and role setup
│   │   │   ├── postgres_store.py
│   │   │   ├── local_auth.py
│   │   │   ├── local_storage.py
│   │   │   ├── roles.py
│   │   │   └── auth.py           
│   │   ├── models/                 # Pydantic schemas
│   │   │   ├── __init__.py
│   │   │   ├── account.py
│   │   │   ├── business.py
│   │   │   ├── complaint.py
│   │   │   ├── document.py  
│   │   │   ├── incident.py 
│   │   │   ├── payment.py      
│   │   │   ├── resident.py  
│   │   │   └── settings.py     
│   │   ├── routes/                     # API endpoints
│   │   │   ├── __init__.py
│   │   │   ├── account_routes.py
│   │   │   ├── audit_routes.py
│   │   │   ├── business_routes.py
│   │   │   ├── complaint_routes.py
│   │   │   ├── dashboard.py 
│   │   │   ├── document_routes.py
│   │   │   ├── incident_routes.py
│   │   │   ├── payment_routes.py      
│   │   │   ├── resident_routes.py      
│   │   │   └── settings_routes.py
│   │   ├── services/                   # Business logic
│   │   │   ├── __init__.py
│   │   │   ├── account_service.py
│   │   │   ├── business_service.py
│   │   │   ├── complaint_service.py
│   │   │   ├── document_service.py 
│   │   │   ├── incident_service.py    
│   │   │   ├── payment_service.py 
│   │   │   ├── paymongo_service.py 
│   │   │   ├── resident_service.py     
│   │   │   └── settings_service.py
│   │   ├── utils/                 # Reusable helpers (validation, formatting)
│   │   │   ├── __init__.py
│   │   │   ├── barangay_documents.py  
│   │   │   ├── fee_calculator.py
│   │   │   └── sanitize.py      
│   │   ├── __init__.py
│   │   └── main.py                # Entry point
│   ├── tests/                     # Unit and integration tests
│   │   ├── test_routes.py
│   │   └── test_residents.py
│   ├── .env
│   ├── v
│   ├── venv
│   ├── __init__.py
│   ├── assign_claims.py
│   ├── get-pip.py
│   ├── Dockerfile
│   ├── requirements.txt
│   
├── config/
│   └── role_permissions.json 
│
├── frontend/                      # React frontend
│   ├── public/
│   ├── build/
│   ├── src/
│   │   ├── assets/                # Images, icons, etc.
│   │   ├── components/            # Reusable UI components
│   │   │   ├── admin/
│   │   │   │   ├── AnalyticsPanel.js
│   │   │   │   ├── CreateAccountForm.js
│   │   │   │   ├── RoleManager.js
│   │   │   │   └── SettingsPanel.js
│   │   │   ├── audit/
│   │   │   │   ├── AuditExportPanel.js
│   │   │   │   ├── ComplianceReport.js
│   │   │   │   ├── RegistrySnapshot.js
│   │   │   │   └── SystemUsageStats.js
│   │   │   ├── auth/
│   │   │   │   ├── ProtectedRoute.js 
│   │   │   │   ├── ResidentDashboardWrapper.js
│   │   │   │   └── SecureNavLink.js
│   │   │   ├── dashboard/
│   │   │   │   ├── ComplaintList.js
│   │   │   │   ├── DashboardCard.js
│   │   │   │   ├── DocumentQueue.js
│   │   │   │   ├── IncidentQueue.js
│   │   │   │   ├── RegistryAudit.js
│   │   │   │   ├── RegistryOverview.js
│   │   │   │   └── SummaryCards.js
│   │   │   ├── document/
│   │   │   │   ├── AuditTable.js 
│   │   │   │   ├── DocumentSummaryCards.js
│   │   │   │   └── SearchFilters.js
│   │   │   ├── finance/
│   │   │   │   ├── FeeTracker.js
│   │   │   │   ├── FinancialReportPanel.js
│   │   │   │   ├── LedgerExport.js
│   │   │   │   └── PaymentVerification.js
│   │   │   ├── forms/
│   │   │   │   ├── business-form.css
│   │   │   │   ├── BusinessForm.js
│   │   │   │   ├── complaint-form.css 
│   │   │   │   ├── ComplaintForm.js
│   │   │   │   ├── document-form.css 
│   │   │   │   ├── DocumentForm.js
│   │   │   │   ├── incident-form.css 
│   │   │   │   ├── IncidentForm.js
│   │   │   │   ├── resident-form.css
│   │   │   │   ├── ResidentForm.js
│   │   │   │   ├── signature-field.css
│   │   │   │   └── SignatureField.js
│   │   │   ├── layout
│   │   │   │   └── DashboardSection.js
│   │   │   ├── lists
│   │   │   │   ├── resident-list.css
│   │   │   │   └── ResidentList.js
│   │   │   ├── resident/
│   │   │   │   ├── FeedbackForm.js
│   │   │   │   ├── MyComplaints.js
│   │   │   │   ├── RegisterBusiness.js
│   │   │   │   ├── ReportIncident.js
│   │   │   │   ├── RequestDocument.js
│   │   │   │   └── StatusTracker.js
│   │   │   ├── secretary/
│   │   │   │   ├── CertificateApprovalPanel.js
│   │   │   │   └── RegistryValidator.js
│   │   │   ├── staff/
│   │   │   │   ├── business-eval-modal.css
│   │   │   │   ├── BusinessEvaluationModal.js
│   │   │   │   ├── ComplaintEvaluationModal.js
│   │   │   │   └── modal.css
│   │   │   ├── youth/
│   │   │   │   ├── EventCalendar.js
│   │   │   │   ├── ProgramList.js
│   │   │   │   ├── YouthFeedbackForm.js
│   │   │   │   └── YouthRegistry.js
│   │   │   ├── main-layout.css
│   │   │   ├── MainLayout.js
│   │   │   ├── PublicLayout.js
│   │   │   └── ResidentRegistry.js
│   │   ├── config/
│   │   │   ├── metrics.js
│   │   │   ├── navigation.js
│   │   │   ├── role_permissions.json
│   │   │   ├── roles.js
│   │   │   └── stats.js
│   │   ├── context/
│   │   │   ├── ThemeContext.js
│   │   │   └── UserContext.js
│   │   ├── data/
│   │   │   └── locations.js       # barangay locations can be edited depends on which barangay
│   │   ├── hooks/
│   │   │   └── useResidents.js
│   │   ├── pages/                 # Route-level views
│   │   │   ├── adminDashboard.css
│   │   │   ├── AdminDashboard.js
│   │   │   ├── AuditView.js
│   │   │   ├── business-dashboard.css
│   │   │   ├── BusinessDashboard.js
│   │   │   ├── complaints.css 
│   │   │   ├── Complaints.js
│   │   │   ├── documents.css
│   │   │   ├── Documents.js        
│   │   │   ├── incidents.css 
│   │   │   ├── Incidents.js  
│   │   │   ├── login.css
│   │   │   ├── Login.js
│   │   │   ├── NotFound.js
│   │   │   ├── ResetPassword.js
│   │   │   ├── resident.css
│   │   │   ├── ResidentDashboard.js
│   │   │   ├── SecretaryDashboard.js
│   │   │   ├── SKDashboard.js
│   │   │   ├── staff-dashboard.css
│   │   │   ├── StaffDashboard.js
│   │   │   ├── TreasurerDashboard.js
│   │   │   └── Unauthorized.js
│   │   ├── routes/
│   │   │   └── AppRoutes.js
│   │   ├── services/              # API client and mail delivery helpers
│   │   │   ├── api.js
│   │   │   └── email.js
│   │   ├── styles/   
│   │   │   ├── components/
│   │   │   ├── core/
│   │   │   ├── dashboard/
│   │   │   ├── staff/
│   │   │   ├── admin.css
│   │   │   ├── audit.css
│   │   │   ├── Dashboard.css
│   │   │   ├── layout.css
│   │   │   ├── resident.css
│   │   │   ├── secretary.css
│   │   │   ├── sk.css
│   │   │   ├── staff.css
│   │   │   └── treasurer.css
│   │   ├── utils/
│   │   │   ├── cleanPayload.js
│   │   │   ├── fileUtils.js
│   │   │   └── locationService.js
│   │   ├── App.js
│   │   ├── index.css
│   │   ├── index.js
│   │   └── logo.svg
│   ├── package.json
│   ├── firebase.json
│   ├── .env                  # not yet created                       
│   ├── README.md
└──-└── .gitignore
