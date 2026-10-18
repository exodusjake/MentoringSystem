-- ============================================================
-- One-time migration: collapse "Section" (Course + YearLevel +
-- SectionLetter, e.g. "BSIT 1A") down to Course-only ("BSIT")
-- everywhere. See project plan "Collapse Section down to
-- Course-only, system-wide" for the full rationale.
--
-- Business logic across the whole app (SQL procs/views, JS,
-- EmailService.cs) compares SectionCode BY STRING VALUE, never by
-- SectionID — so normalizing the data here is the whole fix; no
-- other proc/view needs editing.
-- ============================================================
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

BEGIN TRANSACTION;

-- ── Step 1: consolidate duplicate Sections per (School, Course) ──
-- No-op against today's data (every course currently has exactly one
-- "1st Year A" section) but kept generic/idempotent in case more
-- sections (1B, 2A, ...) exist by the time this runs.
;WITH Canonical AS (
    SELECT School, Course, MIN(SectionID) AS CanonicalID
    FROM dbo.Sections
    WHERE IsActive = 1
    GROUP BY School, Course
),
Duplicates AS (
    SELECT s.SectionID, c.CanonicalID
    FROM dbo.Sections s
    JOIN Canonical c ON c.School = s.School AND c.Course = s.Course
    WHERE s.IsActive = 1 AND s.SectionID <> c.CanonicalID
)
UPDATE mp
   SET mp.SectionID = d.CanonicalID
FROM dbo.MenteeProfiles mp
JOIN Duplicates d ON d.SectionID = mp.SectionID;

;WITH Canonical AS (
    SELECT School, Course, MIN(SectionID) AS CanonicalID
    FROM dbo.Sections
    WHERE IsActive = 1
    GROUP BY School, Course
)
UPDATE s
   SET s.IsActive = 0
FROM dbo.Sections s
JOIN Canonical c ON c.School = s.School AND c.Course = s.Course
WHERE s.IsActive = 1 AND s.SectionID <> c.CanonicalID;

-- ── Step 2: collapse every remaining active Section's code to Course-only ──
-- YearLevel/SectionLetter columns stay in the schema (dropping them is
-- unneeded risk) but stop being read meaningfully anywhere going forward.
UPDATE dbo.Sections
   SET SectionCode = UPPER(Course)
WHERE IsActive = 1;

-- ── Step 3: normalize the STRUCTURED Sessions.SectionCode column on ──
-- ── historical rows, so quota counting stays consistent, not reset ──
-- Notes text is deliberately left untouched — an old "[BSIT 1A]" tag in
-- a mentor's freeform notes is cosmetic history only, since nothing
-- re-parses Notes text for grouping once the SectionCode column (and,
-- going forward, the bracket text the frontend itself inserts) is
-- Course-only.
UPDATE dbo.Sessions
   SET SectionCode = UPPER(LTRIM(RTRIM(
           SUBSTRING(SectionCode, 1, LEN(SectionCode) - CHARINDEX(' ', REVERSE(SectionCode)))
       )))
WHERE SectionCode IS NOT NULL
  AND SectionCode LIKE '% %'
  AND SectionCode LIKE '%[0-9][A-Za-z]';

COMMIT TRANSACTION;
GO

PRINT 'Done. Sections/Sessions collapsed to Course-level SectionCode.';
GO
