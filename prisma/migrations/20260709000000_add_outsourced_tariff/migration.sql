-- AlterTable
ALTER TABLE "TariffSubmission" ALTER COLUMN "data" DROP NOT NULL;
ALTER TABLE "TariffSubmission" ADD COLUMN "outsourced" BOOLEAN NOT NULL DEFAULT false;
