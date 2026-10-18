-- Phase 3: Timeliness scoring needs to know WHEN a mentor's logsheet was
-- actually submitted, not just whether it currently is — Sessions.LogStatus
-- only ever held the current value with no timestamp. Set whenever
-- LogStatus transitions to 'Submitted' (SessionsController.PatchLogStatus).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER TABLE dbo.Sessions ADD SubmittedAt DATETIME NULL;
GO
