-- ============================================================
-- ASTRA MENTORING SYSTEM — Stored Procedures Batch 2
-- Covers all remaining hardcoded SQL in:
--   ActivitiesService, SessionsAdminService, MonitorActivitiesService,
--   AttendanceLogsService, SessionProofsAdminService,
--   AvailabilityWorkflowService, SectionsService,
--   AnnouncementCommentsService, QRAttendanceService
-- Safe to re-run: CREATE OR ALTER throughout
-- ============================================================
USE AstraMentoring;
GO

PRINT 'Creating / updating stored procedures (batch 2)...';
GO

-- ============================================================
-- Additional view: vw_AnnouncementCommentsWithUser
-- ============================================================
CREATE OR ALTER VIEW dbo.vw_AnnouncementCommentsWithUser AS
SELECT
    c.CommentID,
    c.AnnouncementID,
    c.PostedByUserID,
    c.Content,
    c.PostedAt,
    u.FirstName,
    u.LastName
FROM dbo.AnnouncementComments c
JOIN dbo.Users u ON u.UserID = c.PostedByUserID;
GO

-- ============================================================
-- sp_GetRecentActivities
-- Top-N recent session / proof activities with mentor name.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetRecentActivities
    @Top INT = 10
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@Top)
        u.FirstName + ' ' + u.LastName                                    AS MentorName,
        s.SessionDate,
        s.Status,
        CASE WHEN pos.ProofID IS NOT NULL THEN 'Proof Uploaded'
             ELSE s.Status END                                            AS ActivityType,
        ISNULL(pos.UploadedAt, s.SessionDate)                            AS ActivityDate,
        ISNULL(att.AttendeeCount, 0)                                      AS MenteeCount
    FROM   dbo.Sessions s
    INNER  JOIN dbo.Users u ON u.UserID = s.MentorID
    LEFT   JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
    OUTER  APPLY (
        SELECT COUNT(*) AS AttendeeCount
        FROM   dbo.Attendance a
        WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1
    ) att
    ORDER BY ISNULL(pos.UploadedAt, s.SessionDate) DESC;
END;
GO

-- ============================================================
-- sp_GetMentorCards
-- Admin sessions overview: one card per mentor with aggregates.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorCards
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        u.UserID                                                        AS MentorID,
        u.FirstName,
        u.LastName,
        mp.Department,
        mp.School,
        COUNT(DISTINCT s.SessionID)                                     AS TotalSessions,
        COUNT(DISTINCT CASE WHEN s.Status = 'Completed'
                            THEN s.SessionID END)                       AS CompletedSessions,
        (
            SELECT COUNT(DISTINCT a2.SessionID)
            FROM   dbo.Attendance a2
            INNER  JOIN dbo.Sessions s2 ON s2.SessionID = a2.SessionID
            WHERE  s2.MentorID = u.UserID
              AND  a2.MentorNotes IS NOT NULL AND a2.MentorNotes <> ''
        )                                                               AS SessionsWithNotes,
        MAX(s.SessionDate)                                              AS LastSessionDate,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        )                                                               AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep3.Course AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID = mm3.MenteeID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  mep3.Course IS NOT NULL
            ) t
        )                                                               AS Courses
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    LEFT   JOIN dbo.Sessions        s  ON s.MentorID  = u.UserID
    WHERE  u.IsActive = 1
    GROUP  BY u.UserID, u.FirstName, u.LastName, mp.Department, mp.School
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ============================================================
-- sp_GetMentorSessions
-- Returns 2 result sets: RS1 mentor info, RS2 sessions list.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorSessions
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: mentor info with sections/courses
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.Department, mp.School,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS val
                FROM   dbo.MentorMentee mm
                INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
                LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
                WHERE  mm.MentorID = u.UserID AND mm.IsActive = 1
                  AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep2.Course AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = mm2.MenteeID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  mep2.Course IS NOT NULL
            ) t
        ) AS Courses
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: sessions with attendance counts and proof info
    SELECT
        s.SessionID,
        DENSE_RANK() OVER (ORDER BY s.SessionDate, s.SessionID)         AS SessionNumber,
        s.SessionDate,
        s.TimeEnd,
        s.Status                                                        AS SessionStatus,
        CASE WHEN s.RequestID IS NOT NULL THEN s.Notes
             ELSE COALESCE(s.Notes, 'Mentoring Session')
        END                                                             AS Topic,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                             AS IsMakeup,
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
        END                                                             AS TotalAttendees,
        SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)              AS PresentCount,
        SUM(CASE WHEN a.MentorNotes IS NOT NULL AND a.MentorNotes<>'' THEN 1 ELSE 0 END) AS NotesFilledCount,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.Attendance      a2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = a2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  a2.SessionID = s.SessionID
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        )                                                               AS Sections,
        s.QRCodeToken
    FROM   dbo.Sessions        s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN dbo.Attendance      a  ON a.SessionID  = s.SessionID
    LEFT   JOIN (
        SELECT SessionID, FilePath, FileType,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    WHERE  s.MentorID = @MentorID
    GROUP  BY s.SessionID, s.MentorID, s.SessionDate, s.TimeEnd, s.Status,
              s.RequestID, sr.Purpose, sr.AvailabilityID, s.Notes, p.FilePath, p.FileType, s.QRCodeToken
    ORDER  BY s.SessionDate DESC;
END;
GO

-- ============================================================
-- sp_GetLogsheet
-- Returns 2 result sets: RS1 mentor info, RS2 flat logsheet rows.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetLogsheet
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: mentor info
    SELECT u.UserID AS MentorID, u.FirstName, u.LastName, mp.Department, mp.School
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
        COALESCE(sec.SectionCode, mep.Section, N'—')                 AS SectionCode,
        a.AttendanceID,
        a.ScannedAt,
        COALESCE(a.IsPresent, 0)                                     AS IsPresent,
        a.Remarks,
        a.MentorNotes,
        a.AbsenceReason,
        CASE
            WHEN s.RequestID IS NOT NULL THEN NULL
            WHEN COALESCE(sr.Purpose, s.Notes) LIKE '[[]%[]]%'
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
                  AND  COALESCE(sec2.SectionCode, mep2.Section) <> N'—'
            )
        END                                                           AS Sections,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                           AS IsMakeup,
        p.FilePath  AS ProofFilePath,
        p.FileType  AS ProofFileType
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
GO

-- ============================================================
-- sp_GetSessionsForMentee
-- Returns 2 result sets: RS1 mentor info, RS2 sessions (filtered by mentee's section).
-- Section code is resolved internally.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionsForMentee
    @MentorID INT,
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SectionCode NVARCHAR(100);
    SELECT @SectionCode = COALESCE(sec.SectionCode, mep.Section)
    FROM   dbo.MenteeProfiles mep
    LEFT   JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
    WHERE  mep.UserID = @MenteeID;

    -- RS1: mentor info
    SELECT u.UserID AS MentorID, u.FirstName, u.LastName,
           mp.Department, mp.School, NULL AS Sections, NULL AS Courses
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS2: sessions visible to this mentee's section
    SELECT
        s.SessionID,
        DENSE_RANK() OVER (ORDER BY s.SessionDate, s.SessionID)     AS SessionNumber,
        s.SessionDate,
        s.TimeEnd,
        s.Status                                                     AS SessionStatus,
        CASE WHEN s.RequestID IS NOT NULL THEN s.Notes
             ELSE COALESCE(s.Notes, 'Mentoring Session')
        END                                                          AS Topic,
        CASE WHEN s.RequestID IS NOT NULL THEN CAST(1 AS BIT)
             ELSE CAST(0 AS BIT)
        END                                                          AS IsMakeup,
        0 AS TotalAttendees, 0 AS PresentCount, 0 AS NotesFilledCount,
        NULL AS ProofFilePath, NULL AS ProofFileType, NULL AS Sections,
        s.QRCodeToken
    FROM   dbo.Sessions        s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    WHERE  s.MentorID = @MentorID
      AND  (
           NOT (COALESCE(sr.Purpose, s.Notes) LIKE '[[]%[]]%')
           OR  COALESCE(sr.Purpose, s.Notes) LIKE '[[]' + @SectionCode + ']%'
      )
    ORDER  BY s.SessionDate DESC;
END;
GO

-- ============================================================
-- sp_GetSessionMentees
-- UNION ALL: regular session members + makeup approved attendees.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionMentees
    @SessionID INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        a.AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'—')   AS SectionCode,
        mep.Course, mep.YearLevel,
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks
    FROM   dbo.Sessions        s
    JOIN   dbo.MentorMentee    mm  ON mm.MentorID  = s.MentorID AND mm.IsActive = 1
    JOIN   dbo.Users           ue  ON ue.UserID    = mm.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = mm.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    LEFT   JOIN dbo.Attendance a   ON a.SessionID    = s.SessionID AND a.MenteeID = mm.MenteeID
    WHERE  s.SessionID = @SessionID
      AND  s.RequestID IS NULL
      AND  (
           NOT (COALESCE(s.Notes,'') LIKE '[[]%[]]%')
           OR COALESCE(sec.SectionCode, mep.Section) =
               SUBSTRING(s.Notes,2,IIF(CHARINDEX(']',s.Notes)>2,CHARINDEX(']',s.Notes)-2,0))
      )

    UNION ALL

    SELECT
        a.AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'—')   AS SectionCode,
        mep.Course, mep.YearLevel,
        a.IsPresent, a.ScannedAt, a.AbsenceReason, a.MentorNotes, a.Remarks
    FROM   dbo.Attendance      a
    JOIN   dbo.Sessions        s   ON s.SessionID  = a.SessionID AND s.SessionID = @SessionID
    JOIN   dbo.SessionRequests sr  ON sr.RequestID = s.RequestID
    JOIN   dbo.Users           ue  ON ue.UserID    = a.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = a.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    WHERE  a.MenteeID = sr.MenteeID
       OR  EXISTS (
           SELECT 1 FROM dbo.SessionRequests sr2
           WHERE  sr2.AvailabilityID = sr.AvailabilityID
             AND  sr2.MenteeID = a.MenteeID AND sr2.Status = 'Approved'
       )

    ORDER BY MenteeLastName, MenteeFirstName;
END;
GO

-- ============================================================
-- sp_GetMakeupSessionRequesters
-- All approved requesters for a makeup session's availability slot.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMakeupSessionRequesters
    @SessionID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        NULL                                             AS AttendanceID,
        ue.UserID                                        AS MenteeID,
        ue.FirstName                                     AS MenteeFirstName,
        ue.LastName                                      AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'—')   AS SectionCode,
        mep.Course, mep.YearLevel,
        NULL AS IsPresent, NULL AS ScannedAt, NULL AS AbsenceReason, NULL AS MentorNotes, NULL AS Remarks
    FROM   dbo.Sessions        s
    JOIN   dbo.SessionRequests sr_main ON sr_main.RequestID     = s.RequestID
    JOIN   dbo.SessionRequests sr_all  ON sr_all.AvailabilityID = sr_main.AvailabilityID
                                      AND sr_all.Status         = 'Approved'
    JOIN   dbo.Users           ue  ON ue.UserID    = sr_all.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = sr_all.MenteeID
    LEFT   JOIN dbo.Sections   sec ON sec.SectionID  = mep.SectionID
    WHERE  s.SessionID = @SessionID
    ORDER  BY ue.LastName, ue.FirstName;
END;
GO

-- ============================================================
-- sp_GetMentorOverview
-- Returns 2 result sets: RS1 session limit for current semester, RS2 mentor list.
-- CompletedSessions is scoped to the current SchoolYear + Semester and includes
-- both regular and make-up sessions (all mentoring work counts toward progress).
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorOverview
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

    -- RS1: session limit for current semester
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: mentor overview rows (all counts scoped to current semester)
    SELECT
        u.UserID        AS MentorID,
        u.FirstName, u.LastName, u.Email, u.ContactNumber,
        mp.School, d.DepartmentName,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                        AS MenteeCount,
        (SELECT COUNT(DISTINCT mep.SectionID)
         FROM dbo.MentorMentee mm2
         JOIN dbo.MenteeProfiles mep ON mep.UserID = mm2.MenteeID
         WHERE mm2.MentorID = u.UserID AND mm2.IsActive = 1
           AND mep.SectionID IS NOT NULL)                                          AS SectionCount,
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)              AS CompletedSessions,
        (SELECT MAX(s.SessionDate) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)              AS LastSessionDate,
        (SELECT MIN(s.SessionDate) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Scheduled'
           AND s.SessionDate >= CAST(GETDATE() AS DATE)
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)              AS NextSessionDate
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ============================================================
-- sp_GetMentorDetail
-- Returns 4 result sets:
--   RS1: session limit for current semester
--   RS2: mentor info (CompletedSessions = all completed sessions this semester,
--        including make-up — all mentoring work counts toward progress)
--   RS3: sessions list scoped to current semester
--   RS4: mentees with attendance stats scoped to current semester
-- ============================================================
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

    -- RS1: session limit for current semester
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: mentor info with semester-scoped CompletedSessions (all completed, incl. make-up)
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName,
        u.Email, u.ContactNumber, mp.School, d.DepartmentName,
        (SELECT COUNT(*) FROM dbo.MentorMentee mm
         WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)               AS MenteeCount,
        (SELECT COUNT(*) FROM dbo.Sessions s
         WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
           AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)    AS CompletedSessions
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1;

    -- RS3: sessions for current semester with attendance
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
        CASE WHEN EXISTS (SELECT 1 FROM dbo.ProofOfSession p
                          WHERE p.SessionID = s.SessionID)
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END                                                          AS HasProof
    FROM   dbo.Sessions s
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    WHERE  s.MentorID = @MentorID
      AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
    ORDER  BY s.SessionDate DESC;

    -- RS4: mentees with attendance stats (scoped to current semester)
    SELECT
        u.UserID          AS MenteeID,
        u.FirstName, u.LastName, u.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'—')                AS SectionCode,
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
GO

-- ============================================================
-- sp_GetAttendanceOverview
-- Returns 2 result sets: RS1 summary totals, RS2 mentor cards.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetAttendanceOverview
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: global summary
    SELECT
        COUNT(a.AttendanceID)                                        AS TotalRecords,
        SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)           AS PresentCount,
        COUNT(a.AttendanceID) - SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END) AS AbsentCount
    FROM dbo.Attendance a;

    -- RS2: per-mentor card
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.Department, mp.School,
        ISNULL(ms.TotalSessions,  0) AS TotalSessions,
        ISNULL(ms.TotalAttendees, 0) AS TotalAttendees,
        ISNULL(ms.PresentCount,   0) AS PresentCount,
        ms.LastSessionDate,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec2.SectionCode, mep2.Section) AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep3.Course AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID = mm3.MenteeID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  mep3.Course IS NOT NULL
            ) t
        ) AS Courses
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN (
        SELECT
            s.MentorID,
            COUNT(DISTINCT s.SessionID)                              AS TotalSessions,
            COUNT(*)                                                  AS TotalAttendees,
            SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)        AS PresentCount,
            MAX(s.SessionDate)                                        AS LastSessionDate
        FROM   dbo.Sessions      s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID AND mm.IsActive = 1
        LEFT   JOIN dbo.Attendance   a  ON a.SessionID = s.SessionID AND a.MenteeID = mm.MenteeID
        WHERE  s.Status = 'Completed' AND s.SessionDate >= mm.AssignedDate
          AND  (s.RequestID IS NULL
                OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                           WHERE sr.RequestID = s.RequestID AND sr.MenteeID = mm.MenteeID AND sr.Status = 'Approved'))
        GROUP  BY s.MentorID
    ) ms ON ms.MentorID = u.UserID
    WHERE  u.IsActive = 1
      AND  EXISTS (SELECT 1 FROM dbo.MentorMentee mm WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ============================================================
-- sp_GetMentorMenteeAttendance
-- Returns 3 result sets:
--   RS1: session limit for current semester
--   RS2: mentor info
--   RS3: mentee attendance cards (scoped to current semester)
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorMenteeAttendance
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

    -- RS1: session limit for current semester
    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: mentor info with sections/courses
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, mp.Department, mp.School,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS val
                FROM   dbo.MentorMentee mm
                INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID
                LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
                WHERE  mm.MentorID = u.UserID AND mm.IsActive = 1
                  AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
            ) t
        ) AS Sections,
        (
            SELECT STRING_AGG(val, ', ')
            FROM (
                SELECT DISTINCT mep2.Course AS val
                FROM   dbo.MentorMentee mm2
                INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = mm2.MenteeID
                WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                  AND  mep2.Course IS NOT NULL
            ) t
        ) AS Courses
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    WHERE  u.UserID = @MentorID;

    -- RS3: mentee attendance cards (scoped to current semester)
    SELECT
        ue.UserID                                                     AS MenteeID,
        ue.FirstName AS MenteeFirstName, ue.LastName AS MenteeLastName, ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N'—')                AS SectionCode,
        mep.Course, mep.YearLevel,
        COUNT(DISTINCT s.SessionID)                                   AS TotalSessions,
        SUM(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)            AS PresentCount
    FROM   dbo.Users ue
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = ue.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN dbo.Sessions       s   ON s.MentorID = @MentorID AND s.Status = 'Completed'
                                      AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
                                      AND (s.RequestID IS NULL
                                           OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                                                      WHERE sr.RequestID = s.RequestID
                                                        AND sr.MenteeID = ue.UserID AND sr.Status = 'Approved'))
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID = s.SessionID AND a.MenteeID = ue.UserID
    WHERE  ue.IsActive = 1
    GROUP  BY ue.UserID, ue.FirstName, ue.LastName, ue.StudentNumber,
              sec.SectionCode, mep.Section, mep.Course, mep.YearLevel
    ORDER  BY ue.LastName, ue.FirstName;
END;
GO

-- ============================================================
-- sp_GetMenteeAttendanceHistory
-- CTE + UNION ALL: regular sessions + approved makeup sessions for a mentee.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMenteeAttendanceHistory
    @MenteeID INT,
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;
    WITH RegularRanks AS (
        SELECT SessionID,
               DENSE_RANK() OVER (ORDER BY SessionDate, SessionID) AS Rank
        FROM   dbo.Sessions
        WHERE  MentorID = @MentorID AND RequestID IS NULL
    )
    SELECT
        COALESCE(a.AttendanceID, 0)                                  AS AttendanceID,
        COALESCE(rr.Rank, 0)                                         AS SessionNumber,
        q.IsMakeup,
        q.SessionDate,
        q.Topic,
        q.SessionStatus,
        COALESCE(a.IsPresent, 0)                                     AS IsPresent,
        a.ScannedAt,
        a.AbsenceReason,
        a.MentorNotes,
        CASE WHEN a.AttendanceID IS NOT NULL
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END                                                          AS IsRecorded
    FROM (
        SELECT s.SessionID, s.SessionDate,
               CAST(0 AS BIT) AS IsMakeup,
               CASE
                   WHEN COALESCE(s.Notes,'') LIKE '[[]%[]]%'
                       THEN LTRIM(SUBSTRING(s.Notes, CHARINDEX(']',s.Notes)+1, LEN(s.Notes)))
                   ELSE COALESCE(s.Notes, 'Mentoring Session')
               END AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions s
        INNER  JOIN dbo.MentorMentee mm ON mm.MentorID = s.MentorID
                                       AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
        WHERE  s.MentorID = @MentorID AND s.RequestID IS NULL AND s.Status != 'Cancelled'

        UNION ALL

        SELECT s.SessionID, s.SessionDate,
               CAST(1 AS BIT) AS IsMakeup,
               'Make-up Session' AS Topic,
               s.Status AS SessionStatus
        FROM   dbo.Sessions        s
        INNER  JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
        WHERE  s.MentorID = @MentorID AND s.Status != 'Cancelled'
          AND  sr.MenteeID = @MenteeID AND sr.Status = 'Approved'
    ) q
    LEFT   JOIN RegularRanks rr ON rr.SessionID = q.SessionID
    LEFT   JOIN dbo.Attendance   a  ON a.SessionID = q.SessionID AND a.MenteeID = @MenteeID
    ORDER  BY q.SessionDate DESC;
END;
GO

-- ============================================================
-- sp_GetSessionProofs
-- Returns 2 result sets: RS1 session proof records, RS2 active mentors.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetSessionProofs
AS
BEGIN
    SET NOCOUNT ON;

    -- RS1: session proof rows
    SELECT
        s.SessionID,
        DENSE_RANK() OVER (PARTITION BY s.MentorID ORDER BY s.SessionDate, s.SessionID) AS SessionNumber,
        s.SessionDate,
        s.Status                                            AS SessionStatus,
        COALESCE(sr.Purpose, s.Notes, 'Session')           AS Topic,
        u.UserID                                            AS MentorID,
        u.FirstName                                         AS MentorFirstName,
        u.LastName                                          AS MentorLastName,
        p.ProofID, p.FilePath, p.FileType, p.UploadedAt,
        CASE WHEN p.ProofID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasProof
    FROM   dbo.Sessions s
    JOIN   dbo.Users u              ON u.UserID    = s.MentorID
    LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID
    LEFT   JOIN (
        SELECT SessionID, ProofID, FilePath, FileType, UploadedAt,
               ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn
        FROM   dbo.ProofOfSession
    ) p ON p.SessionID = s.SessionID AND p.rn = 1
    ORDER  BY s.SessionDate DESC, u.LastName, u.FirstName;

    -- RS2: active mentors for filter dropdown
    SELECT DISTINCT
        u.UserID AS MentorID, u.FirstName, u.LastName
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID   = u.UserID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID = u.UserID AND mm.IsActive = 1
    WHERE  u.IsActive = 1
    ORDER  BY u.LastName, u.FirstName;
END;
GO

-- ============================================================
-- sp_GetMentorSlots
-- All availability slots for a mentor with request details.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorSlots
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        a.AvailabilityID, a.AvailableDate, a.StartTime, a.EndTime,
        CASE
            WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr2
                         WHERE sr2.AvailabilityID = a.AvailabilityID AND sr2.Status = 'Pending')
            THEN 'Pending' ELSE 'Open'
        END AS SlotStatus,
        sr.RequestID, sr.Status AS RequestStatus, sr.Purpose, sr.RequestedAt,
        u.FirstName + ' ' + u.LastName AS MenteeName,
        u.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section) AS SectionCode,
        (
            SELECT STRING_AGG(ua.FirstName + ' ' + ua.LastName, ', ')
            FROM   dbo.SessionRequests sra
            INNER  JOIN dbo.Users ua ON ua.UserID = sra.MenteeID
            WHERE  sra.AvailabilityID = a.AvailabilityID AND sra.Status = 'Approved'
        ) AS ApprovedMentees
    FROM   dbo.Availability a
    LEFT   JOIN dbo.SessionRequests sr
           ON sr.AvailabilityID = a.AvailabilityID AND sr.Status IN ('Pending','Approved','Declined')
    LEFT   JOIN dbo.Users u           ON u.UserID    = sr.MenteeID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = sr.MenteeID
    LEFT   JOIN dbo.Sections sec      ON sec.SectionID = mep.SectionID
    WHERE  a.MentorID = @MentorID
    ORDER  BY a.AvailableDate ASC, a.StartTime ASC;
END;
GO

-- ============================================================
-- sp_GetOpenSlotsForMentee
-- Future availability slots for the mentee's assigned mentor.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetOpenSlotsForMentee
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        a.AvailabilityID, a.MentorID,
        u.FirstName + ' ' + u.LastName AS MentorName,
        a.AvailableDate, a.StartTime, a.EndTime,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                          WHERE sr.AvailabilityID = a.AvailabilityID
                            AND sr.MenteeID = @MenteeID AND sr.Status = 'Pending')
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END AS AlreadyRequested,
        CASE WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                          WHERE sr.AvailabilityID = a.AvailabilityID
                            AND sr.MenteeID = @MenteeID AND sr.Status = 'Approved')
             THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)
        END AS AlreadyApproved
    FROM   dbo.Availability a
    INNER  JOIN dbo.MentorMentee mm
           ON mm.MentorID = a.MentorID AND mm.MenteeID = @MenteeID AND mm.IsActive = 1
    INNER  JOIN dbo.Users u ON u.UserID = a.MentorID
    WHERE  a.AvailableDate >= CAST(GETDATE() AS DATE)
    ORDER  BY a.AvailableDate ASC, a.StartTime ASC;
END;
GO

-- ============================================================
-- sp_GetRequestHistoryForMentee
-- Full session request history for a mentee.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetRequestHistoryForMentee
    @MenteeID INT
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        sr.RequestID, sr.Status, sr.Purpose, sr.RequestedAt, sr.RespondedAt,
        u.FirstName + ' ' + u.LastName AS MentorName,
        a.AvailableDate, a.StartTime, a.EndTime
    FROM   dbo.SessionRequests sr
    INNER  JOIN dbo.Availability a ON a.AvailabilityID = sr.AvailabilityID
    INNER  JOIN dbo.Users u        ON u.UserID         = a.MentorID
    WHERE  sr.MenteeID = @MenteeID
    ORDER  BY sr.RequestedAt DESC;
END;
GO

-- ============================================================
-- sp_GetMentorSectionView
-- Full mentor → section → mentee assignment view (admin).
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GetMentorSectionView
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        u1.UserID    AS MentorID,
        u1.FirstName AS MentorFirstName,
        u1.LastName  AS MentorLastName,
        mp.School    AS MentorSchool,
        d.DepartmentName,
        u2.UserID    AS MenteeID,
        u2.FirstName AS MenteeFirstName,
        u2.LastName  AS MenteeLastName,
        u2.StudentNumber,
        me.Course, me.YearLevel, me.Section, me.SectionID,
        s.SectionCode
    FROM   dbo.Users u1
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID    = u1.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    INNER  JOIN dbo.MentorMentee   mm ON mm.MentorID  = u1.UserID AND mm.IsActive = 1
    INNER  JOIN dbo.Users          u2 ON u2.UserID    = mm.MenteeID AND u2.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles me ON me.UserID    = u2.UserID
    LEFT   JOIN dbo.Sections       s  ON s.SectionID  = me.SectionID
    WHERE  u1.IsActive = 1
      AND  mp.School IS NOT NULL AND mp.School != ''
    ORDER  BY u1.LastName, u1.FirstName, s.SectionCode, u2.LastName;
END;
GO

-- ============================================================
-- sp_GenerateQRToken
-- Purges expired tokens then inserts a new one; returns the token + expiry.
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_GenerateQRToken
    @SessionID INT,
    @MenteeID  INT,
    @Token     NVARCHAR(100),
    @ExpiresAt DATETIME
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM dbo.QRTokens WHERE ExpiresAt < GETUTCDATE();
    INSERT INTO dbo.QRTokens (Token, SessionID, MenteeID, ExpiresAt, IsUsed)
    VALUES (@Token, @SessionID, @MenteeID, @ExpiresAt, 0);
    SELECT @Token AS Token, @ExpiresAt AS ExpiresAt;
END;
GO

-- ============================================================
-- sp_SubmitSessionRequest
-- Checks the slot exists + no duplicate pending request, then inserts.
-- Returns: (Success BIT, ErrorMessage NVARCHAR)
-- ============================================================
CREATE OR ALTER PROCEDURE dbo.sp_SubmitSessionRequest
    @MenteeID       INT,
    @AvailabilityID INT,
    @Purpose        NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Availability WHERE AvailabilityID = @AvailabilityID)
    BEGIN
        SELECT 0 AS Success, 'Slot not found.' AS ErrorMessage;
        RETURN;
    END;

    IF EXISTS (
        SELECT 1 FROM dbo.SessionRequests
        WHERE AvailabilityID = @AvailabilityID AND MenteeID = @MenteeID AND Status = 'Pending'
    )
    BEGIN
        SELECT 0 AS Success, 'You already have a pending request for this slot.' AS ErrorMessage;
        RETURN;
    END;

    INSERT INTO dbo.SessionRequests (MenteeID, AvailabilityID, Purpose, Status, RequestedAt)
    VALUES (@MenteeID, @AvailabilityID, @Purpose, 'Pending', GETDATE());

    SELECT 1 AS Success, '' AS ErrorMessage;
END;
GO

-- ============================================================
PRINT 'Done. All stored procedures (batch 2) created / updated.';
GO
