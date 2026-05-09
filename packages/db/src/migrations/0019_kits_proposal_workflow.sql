-- Slice C — Kit generation + approval workflow.
--
-- Estende kits per supportare flusso founder operator manuale:
--  proposal generation -> founder approval -> founder execution
--  (Amazon/Glovo/manual) -> cleaner brief -> setup -> delivery.

-- ─── ENUM: kit_status nuovi valori ─────────────────────────────
-- Valori esistenti (legacy) restano: 'pending_dna', 'pending_quiz',
-- 'composing', 'awaiting_approval', 'ordered', 'delivered_to_cleaner',
-- 'placed_in_property', 'confirmed_by_guest', 'failed'. Postgres non
-- supporta RENAME enum value, quindi deprecate in code.
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'pending_survey';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'proposed';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'approved';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'rejected';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'modified';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'ordering';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'in_transit';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'arrived_at_locker';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'picked_up_by_cleaner';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'set_up';
--> statement-breakpoint
ALTER TYPE "kit_status" ADD VALUE IF NOT EXISTS 'delivered_to_guest';

-- ─── kits: colonne audit + analytics generator ─────────────────
ALTER TABLE "kits"
  ADD COLUMN IF NOT EXISTS "proposal_generated_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "approved_by" UUID REFERENCES "hosts"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "modification_log" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS "generator_agent_version" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "generator_cost_usd" NUMERIC(8, 6),
  ADD COLUMN IF NOT EXISTS "guest_language" VARCHAR(8) NOT NULL DEFAULT 'it',
  ADD COLUMN IF NOT EXISTS "storytelling_it" TEXT,
  ADD COLUMN IF NOT EXISTS "storytelling_en" TEXT,
  ADD COLUMN IF NOT EXISTS "rationale" TEXT,
  ADD COLUMN IF NOT EXISTS "card_message_en" TEXT;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "kits_status_proposal_idx"
  ON "kits" ("status", "proposal_generated_at");
--> statement-breakpoint

-- ─── property_knowledge: kit_default_placement ─────────────────
-- Default override "dove lasciare il kit setup" usato nel WA brief Karen.
-- NULL = "tavolo cucina" default code-side.
ALTER TABLE "property_knowledge"
  ADD COLUMN IF NOT EXISTS "kit_default_placement" TEXT;
