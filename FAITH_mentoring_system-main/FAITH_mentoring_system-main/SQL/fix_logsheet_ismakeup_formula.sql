-- fix_logsheet_ismakeup_formula.sql
--
-- sp_GetLogsheet's IsMakeup column only checked "RequestID IS NOT NULL" --
-- missing the "SectionCode IS NULL" half of the formula every other makeup
-- check in the system uses (sp_GetMentorSessions, SessionsAdminService.cs,
-- etc.): a session is makeup if it came from a session request OR has no
-- real section. That gap meant a session with RequestID = NULL AND
-- SectionCode = NULL (a legitimate makeup-style session that predates the
-- SessionRequests link, or was created directly with no section) reported
-- IsMakeup = 0 here even though every other page in the system treats it
-- as makeup.
--
-- This went unnoticed because logsheet.js used to independently re-derive
-- "is this makeup" from a regex on the topic text, which happened to catch
-- these bracket-less sessions correctly and papered over the wrong
-- IsMakeup value -- but that regex was itself the same fragile pattern
-- already removed everywhere else in the system (it silently breaks for
-- any session whose notes don't follow the "[SECTION] ..." convention).
-- Once logsheet.js was fixed to trust IsMakeup directly (matching every
-- other page), this backend gap became visible: confirmed live for
-- mentor 101 (Marco), whose two true makeup sessions (SessionID 54, 55 --
-- RequestID NULL, SectionCode NULL) were being folded into his one real
-- section instead of the Makeup Sessions group.

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
        COALESCE(sr.Purpose, s.Notes, 'Mentoring Session')            AS Topic,
        s.Status                                                      AS SessionStatus,
        a.MenteeID,
        COALESCE(u.FirstName + ' ' + u.LastName, NULL)               AS MenteeName,
        COALESCE(sec.SectionCode, mep.Section, N'-')                  AS SectionCode,
        a.AttendanceID,
        a.ScannedAt,
        COALESCE(a.IsPresent, 0)                                     AS IsPresent,
        a.Remarks,
        a.MentorNotes,
        a.AbsenceReason,
        CASE
            WHEN s.RequestID IS NOT NULL THEN NULL
            WHEN s.SectionCode IS NOT NULL THEN s.SectionCode
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
        -- Matches sp_GetMentorSessions' formula exactly: makeup if it came
        -- from a session request, OR has no real section of its own.
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             WHEN s.SectionCode IS NULL   THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                            AS IsMakeup,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        mep.SignatureFilePath,
        s.SchoolYear,
        s.Semester,
        -- The session's OWN real section (or NULL for makeup/no-section) --
        -- distinct from the per-mentee SectionCode column above, and the
        -- only thing SessionNumber's eligibility should be based on.
        s.SectionCode AS SessionSectionCode
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
