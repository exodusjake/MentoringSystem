-- Add actual section names to sp_GetMentorDetail's RS2, same STRING_AGG
-- pattern as sp_GetMentorOverview and sp_GetAttendanceOverview — so the
-- Mentor Detail hero can show the same blue section badges the
-- Attendance Detail hero already shows, for visual parity between the
-- two "detail" pages.
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorDetail
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    -- RS1: required sessions for threshold
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: mentor overview (with SectionCount + Sections)
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName,
        u.Email, u.ContactNumber, mp.School, d.DepartmentName,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                               AS MenteeCount,
        (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
         FROM   dbo.MentorMentee    mm2
         INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
         LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
         WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                    AS SectionCount,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec3.SectionCode, mep3.Section) AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID    = mm3.MenteeID
                LEFT   JOIN dbo.Sections       sec3 ON sec3.SectionID = mep3.SectionID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  COALESCE(sec3.SectionCode, mep3.Section) IS NOT NULL
            ) t
        )                                                                                 AS Sections,
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.RequestID IS NULL AND s.Notes LIKE '[[]%]%')                            AS CompletedSessions
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1;

    -- RS3: sessions list (includes ProofFilePath)
    SELECT
        s.SessionID,
        COALESCE(sr.Purpose, s.Notes, 'Session')                    AS Topic,
        s.Status, s.SessionDate, s.Notes,
        (SELECT COUNT(*) FROM dbo.Attendance a
         WHERE a.SessionID = s.SessionID AND a.IsPresent = 1)       AS PresentCount,
        CASE
            WHEN s.RequestID IS NOT NULL THEN
                (SELECT COUNT(DISTINCT sr2.MenteeID) FROM dbo.SessionRequests sr2
                 WHERE sr2.AvailabilityID = sr.AvailabilityID AND sr2.Status = 'Approved')
            ELSE
                (SELECT COUNT(*)
                 FROM   dbo.MentorMentee    mm2
                 INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                 LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                 WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                   AND  (NOT (COALESCE(s.Notes,'') LIKE '[[]%[]]%')
                         OR COALESCE(sec2.SectionCode, mep2.Section) =
                             SUBSTRING(s.Notes,2,IIF(CHARINDEX(']',s.Notes)>2,CHARINDEX(']',s.Notes)-2,0))))
        END                                                          AS TotalMentees,
        CASE WHEN p.ProofID IS NOT NULL
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END                                                          AS HasProof,
        p.FilePath                                                   AS ProofFilePath
    FROM   dbo.Sessions s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
      AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
    ORDER  BY s.SessionDate DESC;

    -- RS4: mentees with attendance stats + IsDropOut + SignatureFilePath
    SELECT
        u.UserID          AS MenteeID,
        u.FirstName, u.LastName, u.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'-')                AS SectionCode,
        ISNULL(mep.IsDropOut, 0)                                    AS IsDropOut,
        mep.SignatureFilePath,
        (SELECT COUNT(*) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND a.IsPresent = 1
           AND sess.MentorID = @MentorID AND sess.Status = 'Completed'
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester
           AND sess.SessionDate >= mm.AssignedDate)                  AS SessionsAttended,
        (SELECT COUNT(DISTINCT s.SessionID)
         FROM dbo.Sessions s
         WHERE s.MentorID = @MentorID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
           AND s.SessionDate >= mm.AssignedDate
           AND (s.RequestID IS NULL
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID
                             AND sr.MenteeID = u.UserID AND sr.Status = 'Approved'))) AS TotalCompleted,
        (SELECT MAX(sess.SessionDate) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND sess.MentorID = @MentorID
           AND a.IsPresent = 1
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester)      AS LastAttended
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = u.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = u.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
