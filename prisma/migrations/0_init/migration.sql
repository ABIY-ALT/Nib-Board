-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "business_area" TEXT NOT NULL,
    "department" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "password_hash" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "password_changed_at" TIMESTAMPTZ(6),
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matter_types" (
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "matter_types_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "matters" (
    "id" TEXT NOT NULL,
    "resolution_number" TEXT NOT NULL,
    "matter_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "board_meeting_date" DATE,
    "board_decision_date" DATE NOT NULL,
    "effective_date" DATE,
    "deadline" DATE NOT NULL,
    "priority" TEXT NOT NULL,
    "business_area" TEXT NOT NULL,
    "responsible_chief_id" TEXT,
    "responsible_deputy_chief_id" TEXT,
    "responsible_director_id" TEXT NOT NULL,
    "current_owner_id" TEXT NOT NULL,
    "accountable_executive_id" TEXT,
    "status" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "current_stage" TEXT NOT NULL DEFAULT '',
    "overall_status" TEXT NOT NULL DEFAULT '',
    "last_action" TEXT NOT NULL DEFAULT '',
    "last_action_date" TIMESTAMPTZ(6),
    "last_action_user_id" TEXT,
    "next_required_action" TEXT NOT NULL DEFAULT '',
    "next_action_role" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by" TEXT,

    CONSTRAINT "matters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "file_type" TEXT NOT NULL DEFAULT 'application/pdf',
    "file_size" TEXT NOT NULL DEFAULT '',
    "uploaded_by" TEXT NOT NULL,
    "uploaded_by_role" TEXT NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_nodes" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "business_area" TEXT NOT NULL DEFAULT '',
    "assigned_at" TIMESTAMPTZ(6) NOT NULL,
    "acted_at" TIMESTAMPTZ(6),
    "action_taken" TEXT,
    "status" TEXT NOT NULL,
    "comment" TEXT,

    CONSTRAINT "workflow_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarifications" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "requested_to" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "question" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "response" TEXT,
    "response_by" TEXT,

    CONSTRAINT "clarifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "implementation_reports" (
    "id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "submitted_by" TEXT NOT NULL,
    "submission_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action_taken" TEXT NOT NULL,
    "what_was_implemented" TEXT NOT NULL,
    "implementation_date" DATE,
    "responsible_area" TEXT,
    "result_outcome" TEXT NOT NULL,
    "current_condition" TEXT NOT NULL,
    "remaining_issues" TEXT,
    "reason_partial" TEXT,
    "comments" TEXT,
    "completion_date" DATE,
    "completion_status" TEXT NOT NULL,
    "reviewed_by" TEXT,
    "review_date" TIMESTAMPTZ(6),
    "review_notes" TEXT,
    "review_decision" TEXT,

    CONSTRAINT "implementation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "matter_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_role" TEXT NOT NULL,
    "user_title" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous_owner_id" TEXT,
    "previous_owner_name" TEXT,
    "previous_owner_role" TEXT,
    "new_owner_id" TEXT,
    "new_owner_name" TEXT,
    "new_owner_role" TEXT,
    "previous_status" TEXT,
    "new_status" TEXT,
    "comment" TEXT,
    "supporting_doc_name" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "matter_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_reason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_events" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "user_id" TEXT,
    "email_attempted" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "detail" TEXT,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "matters_current_owner_idx" ON "matters"("current_owner_id");

-- CreateIndex
CREATE INDEX "matters_director_idx" ON "matters"("responsible_director_id");

-- CreateIndex
CREATE INDEX "matters_chief_idx" ON "matters"("responsible_chief_id");

-- CreateIndex
CREATE INDEX "matters_deputy_idx" ON "matters"("responsible_deputy_chief_id");

-- CreateIndex
CREATE INDEX "matters_business_area_idx" ON "matters"("business_area");

-- CreateIndex
CREATE INDEX "matters_status_idx" ON "matters"("status");

-- CreateIndex
CREATE INDEX "matters_deadline_idx" ON "matters"("deadline");

-- CreateIndex
CREATE INDEX "documents_matter_idx" ON "documents"("matter_id");

-- CreateIndex
CREATE INDEX "workflow_nodes_matter_idx" ON "workflow_nodes"("matter_id", "seq");

-- CreateIndex
CREATE INDEX "clarifications_matter_idx" ON "clarifications"("matter_id");

-- CreateIndex
CREATE UNIQUE INDEX "implementation_reports_matter_id_key" ON "implementation_reports"("matter_id");

-- CreateIndex
CREATE INDEX "audit_logs_matter_idx" ON "audit_logs"("matter_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_expiry_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_events_time_idx" ON "auth_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "auth_events_user_idx" ON "auth_events"("user_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "auth_events_ip_idx" ON "auth_events"("ip", "event", "occurred_at" DESC);

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_matter_type_fkey" FOREIGN KEY ("matter_type") REFERENCES "matter_types"("name") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_current_owner_id_fkey" FOREIGN KEY ("current_owner_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_responsible_director_id_fkey" FOREIGN KEY ("responsible_director_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_responsible_chief_id_fkey" FOREIGN KEY ("responsible_chief_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_responsible_deputy_chief_id_fkey" FOREIGN KEY ("responsible_deputy_chief_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_accountable_executive_id_fkey" FOREIGN KEY ("accountable_executive_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_last_action_user_id_fkey" FOREIGN KEY ("last_action_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matters" ADD CONSTRAINT "matters_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_nodes" ADD CONSTRAINT "workflow_nodes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_requested_to_fkey" FOREIGN KEY ("requested_to") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "clarifications" ADD CONSTRAINT "clarifications_response_by_fkey" FOREIGN KEY ("response_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "implementation_reports" ADD CONSTRAINT "implementation_reports_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "implementation_reports" ADD CONSTRAINT "implementation_reports_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "implementation_reports" ADD CONSTRAINT "implementation_reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_matter_id_fkey" FOREIGN KEY ("matter_id") REFERENCES "matters"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

