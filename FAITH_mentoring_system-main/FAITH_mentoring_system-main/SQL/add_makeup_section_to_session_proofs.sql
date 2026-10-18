-- add_makeup_section_to_session_proofs.sql
--
-- Proof Tracking (ADMIN_/JS/session-proofs.js) showed no section/course tag
-- for a makeup (Availability-booked) session's row, since it read
-- Sessions.SectionCode straight -- always NULL on a makeup session (it
-- isn't posted for one section; IsMakeup = RequestID IS NOT NULL OR
-- SectionCode IS NULL depends on exactly that), even though the mentee who
-- attended it has a real section on file. Falls back to the attendee's own
-- section, same COUNT(DISTINCT ...)=1-or-NULL pattern sp_GetLogsheet
-- already uses for its own "Sections" column, so an ambiguous multi-
-- section makeup session still shows blank rather than guessing.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: session proof rows — completed sessions only
    SELECT
        s.SessionID,
        s.SlotName,
        s.SessionDate,
        COALESCE(
            s.SectionCode,
            (
                SELECT CASE
                    WHEN COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section)) = 1
                    THEN MAX(COALESCE(sec2.SectionCode, mep2.Section))
                    ELSE NULL
                END
                FROM   dbo.Attendance      a2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = a2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  a2.SessionID = s.SessionID AND a2.IsPresent = 1
            )
        )                                                    AS SectionCode,
        COALESCE(sr.Purpose, s.Notes, 'Session')            AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        mp.School                                           AS MentorSchool,
        mp.Department                                       AS MentorDepartment,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   dbo.Sessions             s
    JOIN   dbo.Users                u  ON u.UserID     = s.MentorID
    LEFT   JOIN dbo.MentorProfiles  mp ON mp.UserID    = u.UserID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.Status = 'Completed'
    ORDER  BY s.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.School, mp.Department
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO
