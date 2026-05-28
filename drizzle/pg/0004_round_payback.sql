ALTER TABLE "pending_qr" ADD COLUMN "initiator_name" text NOT NULL DEFAULT '';
ALTER TABLE "pending_qr" ALTER COLUMN "initiator_name" DROP DEFAULT;