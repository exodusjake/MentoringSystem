-- REVIEW ONLY. Not executed. Verify deployed MentorMentee and sp_AssignMentor
-- definitions, writer dependencies, and transition timezone before approval.
-- This additive schema preserves every existing relationship without inferring
-- historical period, section, start/end timestamps or QR authorization.
SET XACT_ABORT ON;
BEGIN TRY
  BEGIN TRANSACTION;
  IF OBJECT_ID('dbo.MentorMentee','U') IS NULL OR COL_LENGTH('dbo.MentorMentee','AssignmentID') IS NULL
    THROW 51000, 'Expected assignment schema unavailable; stop for reconciliation.', 1;
  IF COL_LENGTH('dbo.MentorMentee','AssignmentSchoolYear') IS NOT NULL
    THROW 51000, 'History columns already exist; inspect rather than overwrite.', 1;
  ALTER TABLE dbo.MentorMentee ADD
    AssignmentSchoolYear nvarchar(20) NULL,
    EffectiveFrom datetimeoffset(7) NULL,
    EffectiveUntil datetimeoffset(7) NULL,
    SectionCodeAtAssignment nvarchar(100) NULL,
    HistoryVerified bit NOT NULL CONSTRAINT DF_MentorMentee_HistoryVerified DEFAULT(0);
  ALTER TABLE dbo.MentorMentee ADD CONSTRAINT CK_MentorMentee_HistoryInterval CHECK
    (EffectiveUntil IS NULL OR (EffectiveFrom IS NOT NULL AND EffectiveUntil>=EffectiveFrom));
  -- No backfill: existing rows remain explicitly unverified.
  COMMIT;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
END CATCH;
-- BLOCKER: before activating readers, update every verified assignment writer
-- to stamp actual UTC start/year/section and close prior intervals atomically.
-- Current sp_AssignMentor restores MIN(AssignedDate), so that field alone cannot
-- reconstruct reassignments. Reconcile old evidence without rewriting it.
