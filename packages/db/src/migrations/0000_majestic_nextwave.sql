CREATE TYPE "public"."agent_action_status" AS ENUM('success', 'error', 'partial');--> statement-breakpoint
CREATE TYPE "public"."agent_type" AS ENUM('guest_dna', 'kit_composer', 'message_writer', 'conversation', 'onboarding', 'system');--> statement-breakpoint
CREATE TYPE "public"."autopilot_mode" AS ENUM('auto', 'draft', 'escalate');--> statement-breakpoint
CREATE TYPE "public"."autopilot_request_type" AS ENUM('info_wifi', 'info_parking', 'info_checkin', 'info_neighborhood', 'early_checkin_short', 'early_checkin_long', 'late_checkout_short', 'late_checkout_long', 'discount_request', 'extra_services', 'complaint_item_broken', 'complaint_serious', 'emergency', 'small_talk', 'tourist_info');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('confirmed', 'checked_in', 'checked_out', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."conversation_channel" AS ENUM('whatsapp', 'booking_inbox', 'airbnb_inbox', 'email');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."decision_mode" AS ENUM('auto', 'draft', 'escalate', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."kit_status" AS ENUM('pending_dna', 'pending_quiz', 'composing', 'awaiting_approval', 'ordered', 'delivered_to_cleaner', 'placed_in_property', 'confirmed_by_guest', 'failed');--> statement-breakpoint
CREATE TYPE "public"."local_partner_type" AS ENUM('food', 'wine', 'pastry', 'coffee', 'flowers', 'artisan', 'other');--> statement-breakpoint
CREATE TYPE "public"."message_channel" AS ENUM('whatsapp', 'booking_inbox', 'airbnb_inbox', 'email', 'sms');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."message_entity" AS ENUM('premura', 'host', 'cleaner', 'guest');--> statement-breakpoint
CREATE TYPE "public"."message_stage" AS ENUM('pre_arrival_welcome', 'pre_arrival_quiz', 'kit_reveal', 'mid_stay_checkin', 'post_stay_survey', 'post_stay_recovery', 'post_stay_review_nudge', 'cleaner_brief', 'host_alert', 'conversation_reply', 'other');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('pending', 'confirmed', 'scheduled', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payout_validation_method" AS ENUM('cleaner_photo', 'guest_confirmation', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pending_draft_status" AS ENUM('pending', 'approved', 'rejected', 'modified', 'expired');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('booking', 'airbnb', 'direct');--> statement-breakpoint
CREATE TYPE "public"."review_recovery_outcome" AS ENUM('recovered', 'negative_posted', 'no_response', 'pending');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."voice_emoji_usage" AS ENUM('never', 'sparse', 'frequent');--> statement-breakpoint
CREATE TYPE "public"."voice_formality" AS ENUM('tu', 'lei', 'misto');--> statement-breakpoint
CREATE TYPE "public"."voice_message_length" AS ENUM('short', 'medium', 'long');--> statement-breakpoint
CREATE TABLE "hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255),
	"phone" varchar(32),
	"locale" varchar(8) DEFAULT 'it-IT' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Europe/Rome' NOT NULL,
	"stripe_customer_id" varchar(64),
	"stripe_subscription_id" varchar(64),
	"subscription_status" varchar(32),
	"trial_ends_at" timestamp with time zone,
	"default_kit_budget_eur" numeric(8, 2) DEFAULT '12.00',
	"auto_approve_kits" boolean DEFAULT true NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hosts_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "host_voice_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"formality" "voice_formality" DEFAULT 'tu' NOT NULL,
	"emoji_usage" "voice_emoji_usage" DEFAULT 'sparse' NOT NULL,
	"emoji_examples" jsonb DEFAULT '[]'::jsonb,
	"signature_style" text,
	"avg_message_length" "voice_message_length" DEFAULT 'medium' NOT NULL,
	"tone_keywords" jsonb DEFAULT '[]'::jsonb,
	"sample_messages_analyzed" integer DEFAULT 0 NOT NULL,
	"extracted_patterns" jsonb,
	"example_greetings" jsonb DEFAULT '[]'::jsonb,
	"example_closings" jsonb DEFAULT '[]'::jsonb,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_voice_profiles_host_id_unique" UNIQUE("host_id")
);
--> statement-breakpoint
CREATE TABLE "autopilot_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"request_type" "autopilot_request_type" NOT NULL,
	"mode" "autopilot_mode" NOT NULL,
	"limit_minutes" integer,
	"limit_amount_eur" numeric(8, 2),
	"custom_response_template" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"address_line" text NOT NULL,
	"city" varchar(128) NOT NULL,
	"postal_code" varchar(16),
	"country_code" varchar(2) DEFAULT 'IT' NOT NULL,
	"ical_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kit_budget_eur" numeric(8, 2),
	"kit_enabled" boolean DEFAULT true NOT NULL,
	"cleaner_id" uuid,
	"agent_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "property_knowledge_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"arrival_instructions" text,
	"parking" jsonb,
	"check_in" jsonb,
	"check_out" jsonb,
	"wifi" jsonb,
	"heating_ac" jsonb,
	"appliances" jsonb,
	"entertainment" jsonb,
	"waste_disposal" jsonb,
	"emergencies" jsonb,
	"neighborhood" jsonb,
	"house_rules" jsonb,
	"extras" jsonb,
	"completeness_score" integer DEFAULT 0 NOT NULL,
	"updated_by_host" boolean DEFAULT false NOT NULL,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_knowledge_base_property_id_unique" UNIQUE("property_id")
);
--> statement-breakpoint
CREATE TABLE "cleaners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"whatsapp_number" varchar(32) NOT NULL,
	"delivery_address" text NOT NULL,
	"pickup_point_code" varchar(64),
	"per_kit_fee_eur" numeric(6, 2) DEFAULT '2.00' NOT NULL,
	"stripe_account_id" varchar(64),
	"payout_method" varchar(32) DEFAULT 'stripe_connect',
	"payout_iban" varchar(34),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"platform" "platform" NOT NULL,
	"platform_booking_ref" varchar(128) NOT NULL,
	"guest_full_name" varchar(255) NOT NULL,
	"guest_country_code" varchar(2),
	"guest_age_approx" integer,
	"guest_email" varchar(255),
	"guest_phone" varchar(32),
	"whatsapp_opt_in" boolean,
	"num_guests" integer DEFAULT 1 NOT NULL,
	"num_adults" integer DEFAULT 1 NOT NULL,
	"num_children" integer DEFAULT 0 NOT NULL,
	"checkin_at" timestamp with time zone NOT NULL,
	"checkout_at" timestamp with time zone NOT NULL,
	"nights" integer NOT NULL,
	"total_price_eur" numeric(10, 2),
	"guest_note" text,
	"status" "booking_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guest_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"archetype" varchar(128) NOT NULL,
	"archetype_description" text NOT NULL,
	"signals" jsonb NOT NULL,
	"risks" jsonb NOT NULL,
	"confidence" numeric(3, 2) NOT NULL,
	"sources" jsonb DEFAULT '[]'::jsonb,
	"agent_reasoning" text,
	"agent_model" varchar(64),
	"agent_cost_usd" numeric(8, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guest_profiles_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "guest_quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"questions" jsonb NOT NULL,
	"responses" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"status" "kit_status" DEFAULT 'pending_dna' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"theme" varchar(128),
	"card_message" text,
	"budget_eur" numeric(6, 2) NOT NULL,
	"items_total_eur" numeric(6, 2),
	"delivery_eur" numeric(6, 2),
	"service_fee_eur" numeric(6, 2) DEFAULT '0.75' NOT NULL,
	"cleaner_fee_eur" numeric(6, 2) DEFAULT '2.00' NOT NULL,
	"card_fee_eur" numeric(6, 2) DEFAULT '1.00' NOT NULL,
	"total_charged_eur" numeric(6, 2),
	"supplier" varchar(32),
	"supplier_order_ref" varchar(128),
	"delivery_eta" timestamp with time zone,
	"cleaner_briefed_at" timestamp with time zone,
	"cleaner_accepted_at" timestamp with time zone,
	"cleaner_placed_at" timestamp with time zone,
	"cleaner_photo_url" text,
	"guest_confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kits_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"channel" "conversation_channel" NOT NULL,
	"external_thread_id" varchar(255),
	"status" "conversation_status" DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid,
	"conversation_id" uuid,
	"channel" "message_channel" NOT NULL,
	"direction" "message_direction" NOT NULL,
	"from_entity" "message_entity" NOT NULL,
	"to_entity" "message_entity" NOT NULL,
	"stage" "message_stage",
	"body" text NOT NULL,
	"language" varchar(8),
	"intent_classification" text,
	"decision_mode" "decision_mode",
	"draft_approved_by_host" boolean,
	"response_latency_ms" integer,
	"platform_message_id" varchar(255),
	"recipient_external_id" varchar(255),
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"agent_reasoning" text,
	"agent_model" varchar(64),
	"agent_cost_usd" numeric(8, 6),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"host_id" uuid NOT NULL,
	"draft_response" text NOT NULL,
	"reasoning" text,
	"suggested_action" text,
	"status" "pending_draft_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"final_response_sent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"booking_id" uuid,
	"agent" "agent_type" NOT NULL,
	"action_type" varchar(64) NOT NULL,
	"status" "agent_action_status" NOT NULL,
	"input_summary" jsonb,
	"output" jsonb,
	"reasoning" text,
	"model" varchar(64),
	"cost_usd" numeric(10, 6),
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"error_message" text,
	"error_stack" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cleaner_id" uuid NOT NULL,
	"kit_id" uuid,
	"amount_eur" numeric(6, 2) NOT NULL,
	"status" "payout_status" DEFAULT 'pending' NOT NULL,
	"validation_method" "payout_validation_method",
	"confirmed_at" timestamp with time zone,
	"scheduled_for_month" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"stripe_transfer_id" varchar(64),
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"public_score" numeric(3, 1),
	"public_text" text,
	"public_posted_at" timestamp with time zone,
	"private_feedback" jsonb,
	"private_score" numeric(3, 1),
	"private_submitted_at" timestamp with time zone,
	"recovery_triggered" boolean DEFAULT false NOT NULL,
	"recovery_action" text,
	"recovery_outcome" "review_recovery_outcome",
	"recovery_at" timestamp with time zone,
	"cleaner_rating" varchar(8),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "local_partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid,
	"name" varchar(255) NOT NULL,
	"type" "local_partner_type" NOT NULL,
	"city" varchar(128) NOT NULL,
	"address_line" text,
	"country_code" varchar(2) DEFAULT 'IT' NOT NULL,
	"contact_name" varchar(255),
	"whatsapp_number" varchar(32),
	"email" varchar(255),
	"website" varchar(255),
	"catalog" jsonb,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "host_voice_profiles" ADD CONSTRAINT "host_voice_profiles_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_rules" ADD CONSTRAINT "autopilot_rules_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_cleaner_id_cleaners_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_knowledge_base" ADD CONSTRAINT "property_knowledge_base_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cleaners" ADD CONSTRAINT "cleaners_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_profiles" ADD CONSTRAINT "guest_profiles_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_quizzes" ADD CONSTRAINT "guest_quizzes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kits" ADD CONSTRAINT "kits_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_drafts" ADD CONSTRAINT "pending_drafts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_drafts" ADD CONSTRAINT "pending_drafts_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_drafts" ADD CONSTRAINT "pending_drafts_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_payouts" ADD CONSTRAINT "pending_payouts_cleaner_id_cleaners_id_fk" FOREIGN KEY ("cleaner_id") REFERENCES "public"."cleaners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_payouts" ADD CONSTRAINT "pending_payouts_kit_id_kits_id_fk" FOREIGN KEY ("kit_id") REFERENCES "public"."kits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_partners" ADD CONSTRAINT "local_partners_host_id_hosts_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."hosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hosts_email_idx" ON "hosts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "hosts_stripe_customer_idx" ON "hosts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "hosts_created_at_idx" ON "hosts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "autopilot_rules_host_request_uniq" ON "autopilot_rules" USING btree ("host_id","request_type");--> statement-breakpoint
CREATE INDEX "autopilot_rules_host_idx" ON "autopilot_rules" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "properties_host_idx" ON "properties" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "properties_active_idx" ON "properties" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "properties_city_idx" ON "properties" USING btree ("city");--> statement-breakpoint
CREATE INDEX "cleaners_host_idx" ON "cleaners" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "cleaners_active_idx" ON "cleaners" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "bookings_property_idx" ON "bookings" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_platform_ref_uniq" ON "bookings" USING btree ("platform","platform_booking_ref");--> statement-breakpoint
CREATE INDEX "bookings_checkin_idx" ON "bookings" USING btree ("checkin_at");--> statement-breakpoint
CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "guest_profiles_booking_idx" ON "guest_profiles" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "guest_profiles_archetype_idx" ON "guest_profiles" USING btree ("archetype");--> statement-breakpoint
CREATE INDEX "guest_quizzes_booking_idx" ON "guest_quizzes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "guest_quizzes_completed_at_idx" ON "guest_quizzes" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "kits_booking_idx" ON "kits" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "kits_status_idx" ON "kits" USING btree ("status");--> statement-breakpoint
CREATE INDEX "kits_supplier_idx" ON "kits" USING btree ("supplier");--> statement-breakpoint
CREATE INDEX "conversations_booking_idx" ON "conversations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_booking_channel_thread_uniq" ON "conversations" USING btree ("booking_id","channel","external_thread_id");--> statement-breakpoint
CREATE INDEX "messages_booking_idx" ON "messages" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_channel_idx" ON "messages" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "messages_direction_idx" ON "messages" USING btree ("direction");--> statement-breakpoint
CREATE INDEX "messages_stage_idx" ON "messages" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_platform_message_idx" ON "messages" USING btree ("platform_message_id");--> statement-breakpoint
CREATE INDEX "pending_drafts_host_idx" ON "pending_drafts" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "pending_drafts_booking_idx" ON "pending_drafts" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "pending_drafts_message_idx" ON "pending_drafts" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "pending_drafts_status_idx" ON "pending_drafts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pending_drafts_expires_at_idx" ON "pending_drafts" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "agent_actions_host_idx" ON "agent_actions" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "agent_actions_booking_idx" ON "agent_actions" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "agent_actions_agent_idx" ON "agent_actions" USING btree ("agent");--> statement-breakpoint
CREATE INDEX "agent_actions_status_idx" ON "agent_actions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_actions_created_at_idx" ON "agent_actions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pending_payouts_cleaner_idx" ON "pending_payouts" USING btree ("cleaner_id");--> statement-breakpoint
CREATE INDEX "pending_payouts_kit_idx" ON "pending_payouts" USING btree ("kit_id");--> statement-breakpoint
CREATE INDEX "pending_payouts_status_idx" ON "pending_payouts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pending_payouts_scheduled_for_month_idx" ON "pending_payouts" USING btree ("scheduled_for_month");--> statement-breakpoint
CREATE INDEX "pending_payouts_created_at_idx" ON "pending_payouts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reviews_booking_idx" ON "reviews" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "reviews_public_score_idx" ON "reviews" USING btree ("public_score");--> statement-breakpoint
CREATE INDEX "reviews_recovery_triggered_idx" ON "reviews" USING btree ("recovery_triggered");--> statement-breakpoint
CREATE INDEX "local_partners_host_idx" ON "local_partners" USING btree ("host_id");--> statement-breakpoint
CREATE INDEX "local_partners_city_idx" ON "local_partners" USING btree ("city");--> statement-breakpoint
CREATE INDEX "local_partners_type_idx" ON "local_partners" USING btree ("type");--> statement-breakpoint
CREATE INDEX "local_partners_active_idx" ON "local_partners" USING btree ("is_active");