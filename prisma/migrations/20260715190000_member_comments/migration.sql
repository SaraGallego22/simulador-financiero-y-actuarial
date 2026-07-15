-- Replaces MemberDayEvaluation's single comentario/comentarioAutor fields
-- with a MemberComment table: any number of dated, authored remarks per
-- team member per day, instead of one slot that the next evaluator
-- overwrites.
CREATE TABLE "MemberComment" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberComment_teamMemberId_day_idx" ON "MemberComment"("teamMemberId", "day");

ALTER TABLE "MemberComment" ADD CONSTRAINT "MemberComment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing single comments into the new table before dropping the
-- columns they live in, so nothing an evaluator already wrote is lost.
INSERT INTO "MemberComment" ("id", "teamMemberId", "day", "author", "text", "createdAt")
SELECT gen_random_uuid()::text, "teamMemberId", "day", COALESCE("comentarioAutor", 'Sin autor'), "comentario", CURRENT_TIMESTAMP
FROM "MemberDayEvaluation"
WHERE "comentario" IS NOT NULL AND "comentario" <> '';

ALTER TABLE "MemberDayEvaluation" DROP COLUMN "comentario";
ALTER TABLE "MemberDayEvaluation" DROP COLUMN "comentarioAutor";
