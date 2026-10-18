-- Phase 2: ties a logged Session to one of the fixed mentoring checkpoints
-- (see AstraMentoring-Backend/AstraMentoring-Backend/Constants/MentoringSlots.cs)
-- instead of the free-typed topic + read-time-computed "Session #N" ordinal.
-- No backfill for existing rows — they stay NULL and display as plain
-- "Session" going forward (confirmed with the user; guessing a slot from
-- old chronological order would likely be wrong).
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

ALTER TABLE dbo.Sessions ADD SlotName NVARCHAR(50) NULL;
GO
