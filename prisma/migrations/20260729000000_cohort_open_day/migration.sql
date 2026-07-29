-- Gates how many days a team can see: teams start scoped to Día 1 and the
-- admin advances openDay as the challenge progresses (see
-- updateOpenDayAction). Defaults to 1 so existing cohorts don't suddenly
-- expose every day to every team on deploy.
ALTER TABLE "Cohort" ADD COLUMN "openDay" INTEGER NOT NULL DEFAULT 1;
