-- STRUCTURAL FIX: every "which section does this session belong to" check
-- in the system has been re-parsing a "[SECTION] topic text" convention
-- out of the free-text Notes column, every single time, in ~10 different
-- places. That's how one small parsing typo turned into 8 separate bugs
-- this session (mentees seeing/attending sessions from other sections,
-- attendance counts doubling, dashboard status tiers skewed, etc.) — there
-- was never a real relational link, just a text convention repeated
-- everywhere.
--
-- This adds a real SectionCode column, populated once at session-creation
-- time (from the same dropdown the mentor already picks their section
-- from — see SessionsController.Post/Put), so every query can filter on
-- a plain column instead of re-parsing text.

ALTER TABLE dbo.Sessions ADD SectionCode NVARCHAR(100) NULL;
GO

-- One-time backfill for existing sessions, using the same bracket-parsing
-- logic that used to run on every query — done once here instead of on
-- every read from now on.
UPDATE dbo.Sessions
SET    SectionCode = SUBSTRING(Notes, 2, CHARINDEX(']', Notes) - 2)
WHERE  RequestID IS NULL AND Notes LIKE '[[]%]%';
GO
