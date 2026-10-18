-- sp_GetLogsheet: the Sections column's bracket-detection used the pattern
-- '[[]%[]]%' to mean "starts with [, ends that bracket with ], has more
-- text after" — but '[]]' does not actually match a literal ']' the way
-- it was assumed to (verified directly: ']' LIKE '[]]' is false in this
-- SQL Server instance; plain ']' or an explicit ESCAPE clause are needed).
-- The condition never matched, so EVERY regular (bracketed) session's
-- Sections column has been NULL all along, for every mentor. Nothing
-- surfaced because MENTOR/JS/logsheet.js and HEAD/JS/mentor-detail.js
-- both fall back to re-deriving the section from the topic text
-- client-side whenever Sections is falsy — but it silently broke the
-- server-side per-section SessionNumber grouping added in
-- fix_logsheet_semester_reset.sql: with Sections always NULL, every
-- session (regardless of actual section) shared one counter instead of
-- resetting per section.
--
-- Fix: match the same, already-proven-correct pattern used everywhere
-- else in the system ('[[]%]%' — no escaping needed for a plain ']').
-- Everything else in the procedure is unchanged.

CREATE OR ALTER PROCEDURE dbo.sp_GetLogsheet
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: mentor info (includes SignatureFilePath for printed logsheets)
    SELECT u.UserID AS MentorID, u.FirstName, u.LastName,
           mp.Department, mp.School, mp.SignatureFilePath
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: flat rows (one per mentee per session)
    SELECT
        s.SessionID,
        s.SessionDate,
        COALESCE(ava.StartTime, CONVERT(TIME, s.SessionDate))        AS TimeStart,
        s.TimeEnd,
        COALESCE(sr.Purpose, s.Notes, 'Mentoring Session')           AS Topic,
        s.Status                                                      AS SessionStatus,
        a.MenteeID,
        COALESCE(u.FirstName + ' ' + u.LastName, NULL)               AS MenteeName,
        COALESCE(sec.SectionCode, mep.Section, N'-')                 AS SectionCode,
        a.AttendanceID,
        a.ScannedAt,
        COALESCE(a.IsPresent, 0)                                     AS IsPresent,
        a.Remarks,
        a.MentorNotes,
        a.AbsenceReason,
        CASE
            WHEN s.RequestID IS NOT NULL THEN NULL
            WHEN COALESCE(sr.Purpose, s.Notes) LIKE '[[]%]%'
            THEN SUBSTRING(COALESCE(sr.Purpose, s.Notes), 2,
                           IIF(CHARINDEX(']', COALESCE(sr.Purpose, s.Notes)) > 2,
                               CHARINDEX(']', COALESCE(sr.Purpose, s.Notes)) - 2, 0))
            ELSE (
                SELECT CASE
                    WHEN COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section)) = 1
                    THEN MAX(COALESCE(sec2.SectionCode, mep2.Section))
                    ELSE NULL
                END
                FROM   dbo.MentorMentee    mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
                  AND  COALESCE(sec2.SectionCode, mep2.Section) <> N'-'
            )
        END                                                           AS Sections,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                           AS IsMakeup,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        mep.SignatureFilePath,
        s.SchoolYear,
        s.Semester
    FROM   dbo.Sessions          s
    LEFT   JOIN dbo.SessionRequests  sr  ON sr.RequestID      = s.RequestID
    LEFT   JOIN dbo.Availability     ava ON ava.AvailabilityID = sr.AvailabilityID
    LEFT   JOIN dbo.Attendance       a   ON a.SessionID        = s.SessionID
    LEFT   JOIN dbo.Users            u   ON u.UserID           = a.MenteeID
    LEFT   JOIN dbo.MenteeProfiles   mep ON mep.UserID         = a.MenteeID
    LEFT   JOIN dbo.Sections         sec ON sec.SectionID      = mep.SectionID
    LEFT   JOIN (
        SELECT SessionID, FilePath, FileType,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
    ORDER  BY s.SessionDate ASC, s.SessionID ASC, u.LastName ASC, u.FirstName ASC;
END;
