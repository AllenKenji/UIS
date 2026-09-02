CREATE TABLE IF NOT EXISTS bis_documents (
    collection_name TEXT NOT NULL,
    document_id TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_name, document_id)
);

CREATE INDEX IF NOT EXISTS bis_documents_collection_idx ON bis_documents (collection_name);
CREATE INDEX IF NOT EXISTS bis_documents_data_gin_idx ON bis_documents USING GIN (data);

-- Typed tables for the PostgreSQL migration. The payload column preserves fields
-- that are still being moved from the former document-shaped data model.
CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

CREATE TABLE IF NOT EXISTS residents (
    uid TEXT PRIMARY KEY,
    email TEXT,
    full_name TEXT NOT NULL,
    household_id TEXT,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS residents_email_lower_idx ON residents (lower(email));
CREATE INDEX IF NOT EXISTS residents_household_idx ON residents (household_id);

CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    business_id TEXT UNIQUE,
    owner_uid TEXT,
    email TEXT,
    business_name TEXT,
    status TEXT,
    payment_status TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS businesses_owner_idx ON businesses (owner_uid);
CREATE INDEX IF NOT EXISTS businesses_email_lower_idx ON businesses (lower(email));
CREATE INDEX IF NOT EXISTS businesses_status_idx ON businesses (status);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    resident_id TEXT,
    document_type TEXT,
    status TEXT,
    payment_status TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS documents_resident_idx ON documents (resident_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status, payment_status);

CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    business_id TEXT,
    document_id TEXT,
    transaction_id TEXT,
    status TEXT,
    amount NUMERIC(12, 2),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_business_idx ON payments (business_id);
CREATE INDEX IF NOT EXISTS payments_document_idx ON payments (document_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);

CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    reference_number TEXT UNIQUE,
    payment_id TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    resident_id TEXT,
    auth_uid TEXT,
    status TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS incidents_resident_idx ON incidents (resident_id);
CREATE INDEX IF NOT EXISTS incidents_auth_uid_idx ON incidents (auth_uid);

CREATE TABLE IF NOT EXISTS complaints (
    id TEXT PRIMARY KEY,
    filed_by TEXT,
    filed_for TEXT,
    status TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS complaints_filed_by_idx ON complaints (filed_by);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (status);

CREATE TABLE IF NOT EXISTS disbursements (
    id TEXT PRIMARY KEY,
    category TEXT,
    recipient_id TEXT,
    amount NUMERIC(12, 2),
    status TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disbursements_category_idx ON disbursements (category);
CREATE INDEX IF NOT EXISTS disbursements_status_idx ON disbursements (status);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    recipient_uid TEXT,
    notification_type TEXT,
    is_read BOOLEAN NOT NULL DEFAULT false,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications (recipient_uid, is_read);

CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_email_idx ON password_resets (lower(email));

CREATE TABLE IF NOT EXISTS role_changes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_uid TEXT NOT NULL,
    changed_by TEXT,
    action TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_uid TEXT,
    action TEXT NOT NULL,
    collection_name TEXT,
    document_id TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS settings (
    setting_key TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fees (
    id TEXT PRIMARY KEY,
    fee_type TEXT NOT NULL,
    name TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT true,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fees_type_idx ON fees (fee_type, enabled);

CREATE TABLE IF NOT EXISTS document_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS business_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    registration_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
    annual_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS counters (
    counter_name TEXT PRIMARY KEY,
    counter_value BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sk_programs (
    id TEXT PRIMARY KEY,
    title TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sk_events (
    id TEXT PRIMARY KEY,
    title TEXT,
    event_date DATE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS youth_feedback (
    id TEXT PRIMARY KEY,
    author_uid TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_conversations (
    id TEXT PRIMARY KEY,
    participant_one_uid TEXT NOT NULL,
    participant_two_uid TEXT NOT NULL,
    last_message_preview TEXT,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (participant_one_uid, participant_two_uid),
    CHECK (participant_one_uid < participant_two_uid)
);
CREATE INDEX IF NOT EXISTS message_conversations_participant_one_idx ON message_conversations (participant_one_uid, last_message_at DESC);
CREATE INDEX IF NOT EXISTS message_conversations_participant_two_idx ON message_conversations (participant_two_uid, last_message_at DESC);

CREATE TABLE IF NOT EXISTS direct_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
    sender_uid TEXT NOT NULL,
    recipient_uid TEXT NOT NULL,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS direct_messages_conversation_idx ON direct_messages (conversation_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_unread_idx ON direct_messages (recipient_uid, read_at, sent_at DESC);