ALTER TABLE "patient_notes" ADD COLUMN "reference" text NOT NULL;--> statement-breakpoint
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_reference_unique" UNIQUE("reference");