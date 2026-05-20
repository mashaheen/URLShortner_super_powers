CREATE TABLE "links" (
  "id" UUID NOT NULL,
  "original_url" TEXT NOT NULL,
  "short_code" VARCHAR(64) NOT NULL,
  "is_custom_alias" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "expires_at" TIMESTAMPTZ(6),
  "total_click_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "click_events" (
  "id" UUID NOT NULL,
  "link_id" UUID NOT NULL,
  "clicked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referrer_host" VARCHAR(255),
  "device_type" VARCHAR(32) NOT NULL DEFAULT 'unknown',
  "browser" VARCHAR(128),
  "ip_hash" VARCHAR(128),

  CONSTRAINT "click_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_users" (
  "id" UUID NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "password_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_login_at" TIMESTAMPTZ(6),

  CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_sessions" (
  "id" UUID NOT NULL,
  "admin_user_id" UUID NOT NULL,
  "session_token_hash" VARCHAR(128) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "links_short_code_key" ON "links"("short_code");
CREATE INDEX "links_created_at_idx" ON "links"("created_at");
CREATE INDEX "links_is_active_expires_at_idx" ON "links"("is_active", "expires_at");
CREATE INDEX "click_events_link_id_clicked_at_idx" ON "click_events"("link_id", "clicked_at");
CREATE INDEX "click_events_clicked_at_idx" ON "click_events"("clicked_at");
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");
CREATE UNIQUE INDEX "admin_sessions_session_token_hash_key" ON "admin_sessions"("session_token_hash");
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions"("admin_user_id");
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

ALTER TABLE "click_events" ADD CONSTRAINT "click_events_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
