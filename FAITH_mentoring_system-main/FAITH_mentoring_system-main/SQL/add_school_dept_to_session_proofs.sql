-- sp_GetSessionProofs: adds MentorSchool/MentorDepartment to both result
-- sets (proof rows + mentor filter dropdown), sourced from MentorProfiles,
-- so the Proof Tracking page can filter by School/Department like User
-- Management's Sections tab does — instead of one flat list of every
-- mentor across all three schools.

CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH Ranked AS (
        SELECT
            s.SessionID, s.MentorID, s.SessionDate, s.Notes, s.RequestID, s.SectionCode,
            DENSE_RANK() OVER (
                PARTITION BY s.MentorID, s.SchoolYear, s.Semester, s.SectionCode
                ORDER BY s.SessionDate, s.SessionID
            ) AS SessionNumber
        FROM   dbo.Sessions s
        WHERE  s.Status != 'Cancelled'
    )

    -- RS1: session proof rows — completed sessions only
    SELECT
        r.SessionID,
        r.SessionNumber,
        r.SessionDate,
        r.SectionCode,
        COALESCE(sr.Purpose, r.Notes, 'Session')            AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        mp.School                                           AS MentorSchool,
        mp.Department                                       AS MentorDepartment,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   Ranked r
    JOIN   dbo.Sessions             s  ON s.SessionID  = r.SessionID AND s.Status = 'Completed'
    JOIN   dbo.Users                u  ON u.UserID     = r.MentorID
    LEFT   JOIN dbo.MentorProfiles  mp ON mp.UserID    = u.UserID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = r.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = r.SessionID AND p.rn = 1
    ORDER  BY r.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.School, mp.Department
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
