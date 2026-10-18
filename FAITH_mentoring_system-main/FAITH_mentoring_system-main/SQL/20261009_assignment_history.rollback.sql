-- REVIEW ONLY. Disable candidate readers/writers first. Never discard captured
-- history: once populated, rollback the application and retain additive columns.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF COL_LENGTH('dbo.MentorMentee','AssignmentSchoolYear') IS NULL
    THROW 51000, 'Expected candidate schema unavailable.', 1;
  EXEC(N'IF EXISTS(SELECT 1 FROM dbo.MentorMentee WHERE AssignmentSchoolYear IS NOT NULL
    OR EffectiveFrom IS NOT NULL OR EffectiveUntil IS NOT NULL OR SectionCodeAtAssignment IS NOT NULL OR HistoryVerified=1)
    THROW 51000, ''Captured history exists; retain schema and roll back application only.'', 1;');
  ALTER TABLE dbo.MentorMentee DROP CONSTRAINT CK_MentorMentee_HistoryInterval;
  ALTER TABLE dbo.MentorMentee DROP CONSTRAINT DF_MentorMentee_HistoryVerified;
  ALTER TABLE dbo.MentorMentee DROP COLUMN AssignmentSchoolYear,EffectiveFrom,EffectiveUntil,SectionCodeAtAssignment,HistoryVerified;
  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
END CATCH;
