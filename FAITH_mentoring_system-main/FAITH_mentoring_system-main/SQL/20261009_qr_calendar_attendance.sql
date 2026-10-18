-- PREPARED ONLY; NOT EXECUTED. Review database identity and verified restore backup.
-- Five deployed definitions match fix_attendance_counting_rules.sql; alter these four active read modules.
-- Executable modules retain repository newlines: flattened CSV comments are not executable SQL.
-- Drift guards use the production export. Stop on drift; do not bypass the guard.
-- No historical attendance, assignment, session or evaluation records are rewritten.
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
DECLARE @Actual nvarchar(max),@Expected nvarchar(max);
SET @Actual=OBJECT_DEFINITION(OBJECT_ID(N'dbo.fn_MenteeCheckpointAttendance'));
SET @Expected=N' -- ── Part 1: the shared rules ── CREATE   FUNCTION dbo.fn_MenteeCheckpointAttendance (     @SchoolYear NVARCHAR(20),     @Semester   NVARCHAR(50) ) RETURNS TABLE AS RETURN     -- One row per (current mentor, mentee, checkpoint) the mentee was expected     -- at this period; Attended = 1 when scanned present at any session of it.     SELECT mm.MentorID,            mm.MenteeID,            COALESCE(s.SlotName, N''#'' + CAST(s.SessionID AS NVARCHAR(20))) AS CheckpointKey,            MAX(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END)                AS Attended     FROM   dbo.MentorMentee   mm     LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID   = mm.MenteeID     LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID     INNER  JOIN dbo.Sessions       s   ON s.MentorID    = mm.MentorID                                       AND s.Status      = ''Completed''                                       AND s.SchoolYear  = @SchoolYear                                       AND s.Semester    = @Semester                                       AND s.SessionDate >= mm.AssignedDate     LEFT   JOIN dbo.Attendance     a   ON a.SessionID   = s.SessionID AND a.MenteeID = mm.MenteeID     WHERE  mm.IsActive = 1       AND  (              (s.RequestID IS NULL               AND (s.SectionCode IS NULL OR s.SectionCode = COALESCE(sec.SectionCode, mep.Section)))              OR              (s.RequestID IS NOT NULL               AND (a.IsPresent = 1                    OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr                               WHERE  sr.RequestID = s.RequestID                                 AND  sr.MenteeID  = mm.MenteeID                                 AND  sr.Status    = ''Approved'')))            )     GROUP  BY mm.MentorID, mm.MenteeID,               COALESCE(s.SlotName, N''#'' + CAST(s.SessionID AS NVARCHAR(20))); ';
-- Export whitespace may be flattened; normalize only whitespace, never SQL predicates.
SET @Actual=REPLACE(REPLACE(REPLACE(@Actual,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
SET @Expected=REPLACE(REPLACE(REPLACE(@Expected,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
WHILE CHARINDEX('  ',@Actual)>0 SET @Actual=REPLACE(@Actual,'  ',' ');
WHILE CHARINDEX('  ',@Expected)>0 SET @Expected=REPLACE(@Expected,'  ',' ');
IF @Actual IS NULL OR LTRIM(RTRIM(@Actual)) COLLATE Latin1_General_100_BIN2 <> LTRIM(RTRIM(@Expected)) COLLATE Latin1_General_100_BIN2
 THROW 51000,'Definition drift or VIEW DEFINITION unavailable: fn_MenteeCheckpointAttendance',1;
SET @Actual=OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_GetMentorDetail'));
SET @Expected=N' -- ── sp_GetMentorDetail ── CREATE   PROCEDURE dbo.sp_GetMentorDetail     @MentorID INT AS BEGIN     SET NOCOUNT ON;      DECLARE @SchoolYear   NVARCHAR(20),             @Semester     NVARCHAR(50),             @SessionLimit INT = 6;     SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''SchoolYear'';     SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''Semester'';     SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings     WHERE  SettingKey = CASE WHEN @Semester = ''2nd Semester''                              THEN ''SessionLimit2ndSem'' ELSE ''SessionLimit1stSem'' END;      SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester,            (SELECT COUNT(*) FROM dbo.CalendarEvents ce             WHERE ce.EventType = ''Deadline'' AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester               AND ce.StartDate <= GETDATE())                                              AS DueCheckpointCount;      -- RS2: mentor overview (with SectionCount + Sections)     SELECT         u.UserID AS MentorID, u.FirstName, u.LastName,         u.Email, u.ContactNumber, mp.School, d.DepartmentName,         (SELECT COUNT(*) FROM dbo.MentorMentee mm          WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                               AS MenteeCount,         (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))          FROM   dbo.MentorMentee    mm2          INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID          LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID          WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1            AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                    AS SectionCount,         (             SELECT STRING_AGG(val, '', '')             FROM (                 SELECT DISTINCT COALESCE(sec3.SectionCode, mep3.Section) AS val                 FROM   dbo.MentorMentee mm3                 INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID    = mm3.MenteeID                 LEFT   JOIN dbo.Sections       sec3 ON sec3.SectionID = mep3.SectionID                 WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1                   AND  COALESCE(sec3.SectionCode, mep3.Section) IS NOT NULL             ) t         )                                                                                 AS Sections,         (             SELECT COUNT(DISTINCT pair) FROM (                 SELECT s.SlotName + N''|'' + s.SectionCode AS pair                 FROM   dbo.Sessions s                 WHERE  s.MentorID = u.UserID AND s.Status = ''Completed''                   AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester                   AND  s.RequestID IS NULL AND s.SectionCode IS NOT NULL                 UNION ALL                 SELECT s.SlotName + N''|'' + COALESCE(secM.SectionCode, mepM.Section) AS pair                 FROM   dbo.Sessions s                 INNER  JOIN dbo.Attendance     aM   ON aM.SessionID = s.SessionID AND aM.IsPresent = 1                 INNER  JOIN dbo.MenteeProfiles mepM ON mepM.UserID  = aM.MenteeID                 INNER  JOIN dbo.MentorMentee   mmM  ON mmM.MenteeID = aM.MenteeID AND mmM.MentorID = s.MentorID AND mmM.IsActive = 1                 LEFT   JOIN dbo.Sections       secM ON secM.SectionID = mepM.SectionID                 WHERE  s.MentorID = u.UserID AND s.Status = ''Completed''                   AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester                   AND  s.RequestID IS NOT NULL AND s.SlotName IS NOT NULL                   AND  COALESCE(secM.SectionCode, mepM.Section) IS NOT NULL             ) t         )                                                                                AS CompletedSessions,         (             SELECT COUNT(DISTINCT pair) FROM (                 SELECT s4.SlotName + N''|'' + s4.SectionCode AS pair                 FROM   dbo.Sessions s4                 WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester                   AND  s4.RequestID IS NULL AND s4.SectionCode IS NOT NULL AND s4.Status <> ''Cancelled''                   AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = ''Submitted''                   AND  EXISTS (                       SELECT 1 FROM dbo.CalendarEvents ce                       WHERE ce.EventType = ''Deadline'' AND ce.SlotName = s4.SlotName                         AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester                         AND s4.SubmittedAt <= ce.StartDate                   )                 UNION ALL                 SELECT s4.SlotName + N''|'' + COALESCE(sec4M.SectionCode, mep4M.Section) AS pair                 FROM   dbo.Sessions s4                 INNER  JOIN dbo.Attendance     a4M   ON a4M.SessionID = s4.SessionID AND a4M.IsPresent = 1                 INNER  JOIN dbo.MenteeProfiles mep4M ON mep4M.UserID  = a4M.MenteeID                 INNER  JOIN dbo.MentorMentee   mm4M  ON mm4M.MenteeID = a4M.MenteeID AND mm4M.MentorID = s4.MentorID AND mm4M.IsActive = 1                 LEFT   JOIN dbo.Sections       sec4M ON sec4M.SectionID = mep4M.SectionID                 WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester                   AND  s4.RequestID IS NOT NULL AND s4.SlotName IS NOT NULL AND s4.Status <> ''Cancelled''                   AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = ''Submitted''                   AND  COALESCE(sec4M.SectionCode, mep4M.Section) IS NOT NULL                   AND  EXISTS (                       SELECT 1 FROM dbo.CalendarEvents ce                       WHERE ce.EventType = ''Deadline'' AND ce.SlotName = s4.SlotName                         AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester                         AND s4.SubmittedAt <= ce.StartDate                   )             ) t         )                                                                                AS OnTimeCount,         (             SELECT COUNT(DISTINCT pair) FROM (                 SELECT s5.SlotName + N''|'' + s5.SectionCode AS pair                 FROM   dbo.Sessions s5                 WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester                   AND  s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> ''Cancelled''                   AND  s5.LogStatus = ''Submitted''                   AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)                 UNION ALL                 SELECT s5.SlotName + N''|'' + COALESCE(sec5M.SectionCode, mep5M.Section) AS pair                 FROM   dbo.Sessions s5                 INNER  JOIN dbo.Attendance     a5M   ON a5M.SessionID = s5.SessionID AND a5M.IsPresent = 1                 INNER  JOIN dbo.MenteeProfiles mep5M ON mep5M.UserID  = a5M.MenteeID                 INNER  JOIN dbo.MentorMentee   mm5M  ON mm5M.MenteeID = a5M.MenteeID AND mm5M.MentorID = s5.MentorID AND mm5M.IsActive = 1                 LEFT   JOIN dbo.Sections       sec5M ON sec5M.SectionID = mep5M.SectionID                 WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester                   AND  s5.RequestID IS NOT NULL AND s5.SlotName IS NOT NULL AND s5.Status <> ''Cancelled''                   AND  s5.LogStatus = ''Submitted''                   AND  COALESCE(sec5M.SectionCode, mep5M.Section) IS NOT NULL                   AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)             ) t         )                                                                                AS CompleteCount     FROM   dbo.Users u     INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID     LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID     WHERE  u.UserID = @MentorID AND u.IsActive = 1 AND u.Role = ''Mentor'';      -- RS3: sessions list (includes ProofFilePath) -- FULL history, no     -- period filter (see fix_mentor_detail_session_history.sql). Also     -- returns SlotName/LogStatus/SubmittedAt so the frontend can show the     -- same on-time/complete signal per row as the aggregate above.     SELECT         s.SessionID,         COALESCE(sr.Purpose, s.Notes, ''Session'')                    AS Topic,         s.Status, s.SessionDate, s.Notes,         s.SchoolYear, s.Semester,         s.SlotName, s.LogStatus, s.SubmittedAt,         (SELECT COUNT(*)          FROM   dbo.Attendance a          JOIN   dbo.MenteeProfiles mep4 ON mep4.UserID = a.MenteeID          WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1            AND  ISNULL(mep4.IsDropOut, 0) = 0)                       AS PresentCount,         CASE             WHEN s.RequestID IS NOT NULL THEN                 (SELECT COUNT(DISTINCT sr2.MenteeID) FROM dbo.SessionRequests sr2                  WHERE sr2.AvailabilityID = sr.AvailabilityID AND sr2.Status = ''Approved'')             ELSE                 (SELECT COUNT(*)                  FROM   dbo.MentorMentee    mm2                  INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID                  LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID                  WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1                    AND  ISNULL(mep2.IsDropOut, 0) = 0                    AND  (s.SectionCode IS NULL                          OR COALESCE(sec2.SectionCode, mep2.Section) = s.SectionCode))         END                                                          AS TotalMentees,         CASE WHEN p.ProofID IS NOT NULL              THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT)         END                                                          AS HasProof,         p.FilePath                                                   AS ProofFilePath     FROM   dbo.Sessions s     LEFT   JOIN dbo.SessionRequests sr ON sr.RequestID = s.RequestID     LEFT   JOIN (         SELECT SessionID, ProofID, FilePath,                ROW_NUMBER() OVER (PARTITION BY SessionID ORDER BY UploadedAt DESC) AS rn         FROM   dbo.ProofOfSession     ) p ON p.SessionID = s.SessionID AND p.rn = 1     WHERE  s.MentorID = @MentorID     ORDER  BY s.SessionDate DESC;      -- RS4: mentees with attendance stats + IsDropOut + SignatureFilePath     -- (current-period progress figures -- unchanged), plus Email + Course +     -- YearLevel for the mentee card (contact number deliberately left out     -- -- see add_email_course_to_mentor_detail_mentees.sql, the fix this     -- migration restores after scope_timeliness_to_due_checkpoints.sql     -- accidentally reverted it).     SELECT         u.UserID          AS MenteeID,         u.FirstName, u.LastName, u.StudentNumber, u.Email,         mep.Course, mep.YearLevel,         COALESCE(sec.SectionCode, mep.Section, N''-'')                AS SectionCode,         ISNULL(mep.IsDropOut, 0)                                    AS IsDropOut,         mep.SignatureFilePath,         -- Per checkpoint, via the shared rules (dbo.fn_MenteeCheckpointAttendance).         ISNULL(c.Attended, 0)                                        AS SessionsAttended,         ISNULL(c.Expected, 0)                                        AS TotalCompleted,         (SELECT MAX(sess.SessionDate) FROM dbo.Attendance a          JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID          WHERE a.MenteeID = u.UserID AND sess.MentorID = @MentorID            AND a.IsPresent = 1            AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester)      AS LastAttended     FROM   dbo.Users u     INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = u.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1     LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = u.UserID     LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID     LEFT   JOIN (         SELECT MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended         FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)         WHERE  MentorID = @MentorID         GROUP  BY MenteeID     ) c ON c.MenteeID = u.UserID     WHERE  u.IsActive = 1 AND u.Role = ''Mentee''     ORDER  BY u.LastName, u.FirstName; END;  ';
-- Export whitespace may be flattened; normalize only whitespace, never SQL predicates.
SET @Actual=REPLACE(REPLACE(REPLACE(@Actual,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
SET @Expected=REPLACE(REPLACE(REPLACE(@Expected,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
WHILE CHARINDEX('  ',@Actual)>0 SET @Actual=REPLACE(@Actual,'  ',' ');
WHILE CHARINDEX('  ',@Expected)>0 SET @Expected=REPLACE(@Expected,'  ',' ');
IF @Actual IS NULL OR LTRIM(RTRIM(@Actual)) COLLATE Latin1_General_100_BIN2 <> LTRIM(RTRIM(@Expected)) COLLATE Latin1_General_100_BIN2
 THROW 51000,'Definition drift or VIEW DEFINITION unavailable: sp_GetMentorDetail',1;
SET @Actual=OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_GetMentorMenteeAttendance'));
SET @Expected=N' -- ── sp_GetMentorMenteeAttendance ── CREATE   PROCEDURE dbo.sp_GetMentorMenteeAttendance     @MentorID INT AS BEGIN     SET NOCOUNT ON;      DECLARE @SchoolYear   NVARCHAR(20),             @Semester     NVARCHAR(50),             @SessionLimit INT = 6;     SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''SchoolYear'';     SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''Semester'';     SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings     WHERE  SettingKey = CASE WHEN @Semester = ''2nd Semester''                              THEN ''SessionLimit2ndSem'' ELSE ''SessionLimit1stSem'' END;      -- RS1: session limit for current semester     SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;      -- RS2: mentor info with sections/courses     SELECT         u.UserID AS MentorID, u.FirstName, u.LastName, u.Email, mp.Department, mp.School,         (             SELECT STRING_AGG(val, '', '')             FROM (                 SELECT DISTINCT COALESCE(sec.SectionCode, mep.Section) AS val                 FROM   dbo.MentorMentee mm                 INNER  JOIN dbo.MenteeProfiles mep ON mep.UserID    = mm.MenteeID                 LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID                 WHERE  mm.MentorID = u.UserID AND mm.IsActive = 1                   AND  COALESCE(sec.SectionCode, mep.Section) IS NOT NULL             ) t         ) AS Sections,         (             SELECT STRING_AGG(val, '', '')             FROM (                 SELECT DISTINCT mep2.Course AS val                 FROM   dbo.MentorMentee mm2                 INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID = mm2.MenteeID                 WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1                   AND  mep2.Course IS NOT NULL             ) t         ) AS Courses     FROM   dbo.Users u     LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID     WHERE  u.UserID = @MentorID;      -- RS3: mentee attendance cards (current semester), per checkpoint, using     -- the shared rules in dbo.fn_MenteeCheckpointAttendance.     SELECT         ue.UserID                                                     AS MenteeID,         ue.FirstName AS MenteeFirstName, ue.LastName AS MenteeLastName, ue.StudentNumber,         COALESCE(sec.SectionCode, mep.Section, N''-'')                  AS SectionCode,         mep.Course, mep.YearLevel,         ISNULL(c.Expected, 0)                                         AS TotalSessions,         ISNULL(c.Attended, 0)                                         AS PresentCount     FROM   dbo.Users ue     INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = ue.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1     LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID     LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID     LEFT   JOIN (         SELECT MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended         FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)         WHERE  MentorID = @MentorID         GROUP  BY MenteeID     ) c ON c.MenteeID = ue.UserID     WHERE  ue.IsActive = 1     ORDER  BY ue.LastName, ue.FirstName; END;  ';
SET @Actual=REPLACE(REPLACE(REPLACE(@Actual,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
SET @Expected=REPLACE(REPLACE(REPLACE(@Expected,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
WHILE CHARINDEX('  ',@Actual)>0 SET @Actual=REPLACE(@Actual,'  ',' ');
WHILE CHARINDEX('  ',@Expected)>0 SET @Expected=REPLACE(@Expected,'  ',' ');
IF @Actual IS NULL OR LTRIM(RTRIM(@Actual)) COLLATE Latin1_General_100_BIN2 <> LTRIM(RTRIM(@Expected)) COLLATE Latin1_General_100_BIN2
 THROW 51000,'Definition drift or VIEW DEFINITION unavailable: sp_GetMentorMenteeAttendance',1;
SET @Actual=OBJECT_DEFINITION(OBJECT_ID(N'dbo.sp_GetAttendanceFullReport'));
SET @Expected=N' -- ── sp_GetAttendanceFullReport ── CREATE   PROCEDURE dbo.sp_GetAttendanceFullReport     @School NVARCHAR(100) = NULL AS BEGIN     SET NOCOUNT ON;      DECLARE @SchoolYear   NVARCHAR(20),             @Semester     NVARCHAR(50),             @SessionLimit INT = 6;     SELECT @SchoolYear   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''SchoolYear'';     SELECT @Semester     = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''Semester'';     SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings     WHERE  SettingKey = CASE WHEN @Semester = ''2nd Semester''                              THEN ''SessionLimit2ndSem'' ELSE ''SessionLimit1stSem'' END;      -- RS1: session limit for current semester     SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions;      -- RS2: one row per active mentor (filtered by school if provided)     SELECT         u.UserID    AS MentorID,         u.FirstName, u.LastName,         mp.Department, mp.School,         COUNT(DISTINCT s.SessionID) AS TotalSessions     FROM   dbo.Users u     LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID     LEFT   JOIN dbo.Sessions       s  ON s.MentorID   = u.UserID                                      AND s.Status      = ''Completed''                                      AND s.SchoolYear  = @SchoolYear                                      AND s.Semester    = @Semester     WHERE  u.Role = ''mentor'' AND u.IsActive = 1       AND  (@School IS NULL OR mp.School = @School)     GROUP  BY u.UserID, u.FirstName, u.LastName, mp.Department, mp.School     ORDER  BY u.LastName, u.FirstName;      -- RS3: one row per mentee, for all mentors in RS2     SELECT         mm.MentorID,         ue.UserID                                           AS MenteeID,         ue.FirstName AS MenteeFirstName,         ue.LastName  AS MenteeLastName,         ue.StudentNumber,         COALESCE(sec.SectionCode, mep.Section, N''-'')       AS SectionCode,         mep.Course,         mep.YearLevel,         ISNULL(c.Expected, 0)                               AS TotalSessions,         ISNULL(c.Attended, 0)                               AS PresentCount     FROM   dbo.MentorMentee mm     INNER  JOIN dbo.Users          um  ON um.UserID   = mm.MentorID AND um.Role = ''mentor'' AND um.IsActive = 1     INNER  JOIN dbo.Users          ue  ON ue.UserID   = mm.MenteeID AND ue.IsActive = 1     LEFT   JOIN dbo.MentorProfiles mp2 ON mp2.UserID  = mm.MentorID     LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID     LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID     LEFT   JOIN (         -- Per checkpoint, via the shared rules.         SELECT MentorID, MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended         FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)         GROUP  BY MentorID, MenteeID     ) c ON c.MentorID = mm.MentorID AND c.MenteeID = mm.MenteeID     WHERE  mm.IsActive = 1       AND  (@School IS NULL OR mp2.School = @School)     ORDER  BY mm.MentorID, ue.LastName, ue.FirstName; END;  ';
SET @Actual=REPLACE(REPLACE(REPLACE(@Actual,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
SET @Expected=REPLACE(REPLACE(REPLACE(@Expected,CHAR(13),' '),CHAR(10),' '),CHAR(9),' ');
WHILE CHARINDEX('  ',@Actual)>0 SET @Actual=REPLACE(@Actual,'  ',' ');
WHILE CHARINDEX('  ',@Expected)>0 SET @Expected=REPLACE(@Expected,'  ',' ');
IF @Actual IS NULL OR LTRIM(RTRIM(@Actual)) COLLATE Latin1_General_100_BIN2 <> LTRIM(RTRIM(@Expected)) COLLATE Latin1_General_100_BIN2
 THROW 51000,'Definition drift or VIEW DEFINITION unavailable: sp_GetAttendanceFullReport',1;
BEGIN TRANSACTION;
BEGIN TRY
EXEC sys.sp_executesql N'CREATE OR ALTER FUNCTION dbo.fn_MenteeCheckpointAttendance
(
    @SchoolYear NVARCHAR(20),
    @Semester   NVARCHAR(50)
)
RETURNS TABLE
AS
RETURN
    -- One row per (current mentor, mentee, checkpoint) the mentee was expected
    -- at this period; Attended = 1 when scanned present at any session of it.
    SELECT mm.MentorID,
           mm.MenteeID,
           COALESCE(s.SlotName, N''#'' + CAST(s.SessionID AS NVARCHAR(20))) AS CheckpointKey,
           MAX(CASE WHEN a.IsPresent = 1 AND a.ScannedAt IS NOT NULL THEN 1 ELSE 0 END)                AS Attended
    FROM   dbo.MentorMentee   mm
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID   = mm.MenteeID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    INNER  JOIN dbo.Sessions       s   ON s.MentorID    = mm.MentorID
                                      AND s.Status      = ''Completed''
                                      AND s.TimeEnd IS NOT NULL
                                      AND s.SchoolYear  = @SchoolYear
                                      AND s.Semester    = @Semester
                                      AND s.SessionDate >= mm.AssignedDate
    LEFT   JOIN dbo.Attendance     a   ON a.SessionID   = s.SessionID AND a.MenteeID = mm.MenteeID
           AND a.IsPresent = 1 AND a.ScannedAt IS NOT NULL
           AND EXISTS (SELECT 1 FROM dbo.CalendarEvents e
                       WHERE e.EventType=''Session Schedule'' AND e.IsPublished=1
                         AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                         AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                         AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
    WHERE  mm.IsActive = 1
      AND (s.Semester<>''2nd Semester'' OR s.SlotName<>''Mentoring Assembly'')
      AND EXISTS (SELECT 1 FROM dbo.CalendarEvents e
                  WHERE e.EventType=''Session Schedule'' AND e.IsPublished=1
                    AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                    AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date)
                        AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
      AND  (
             (s.RequestID IS NULL
              AND (s.SectionCode IS NULL OR s.SectionCode = COALESCE(sec.SectionCode, mep.Section)))
             OR
             (s.RequestID IS NOT NULL
              AND (a.IsPresent = 1 AND a.ScannedAt IS NOT NULL
                   OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                              WHERE  sr.RequestID = s.RequestID
                                AND  sr.MenteeID  = mm.MenteeID
                                AND  sr.Status    = ''Approved'')))
           )
    GROUP  BY mm.MentorID, mm.MenteeID,
              COALESCE(s.SlotName, N''#'' + CAST(s.SessionID AS NVARCHAR(20)));';
EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE dbo.sp_GetMentorDetail
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''SchoolYear'';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''Semester'';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = ''2nd Semester''
                             THEN ''SessionLimit2ndSem'' ELSE ''SessionLimit1stSem'' END;

    SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester,
           (SELECT COUNT(*) FROM dbo.CalendarEvents ce
            WHERE ce.EventType = ''Deadline'' AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester
              AND ce.StartDate <= GETDATE())                                              AS DueCheckpointCount;

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
            SELECT STRING_AGG(val, '', '')
            FROM (
                SELECT DISTINCT COALESCE(sec3.SectionCode, mep3.Section) AS val
                FROM   dbo.MentorMentee mm3
                INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID    = mm3.MenteeID
                LEFT   JOIN dbo.Sections       sec3 ON sec3.SectionID = mep3.SectionID
                WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                  AND  COALESCE(sec3.SectionCode, mep3.Section) IS NOT NULL
            ) t
        )                                                                                 AS Sections,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s.SlotName + N''|'' + s.SectionCode AS pair
                FROM   dbo.Sessions s
                WHERE  s.MentorID = u.UserID AND s.Status = ''Completed''
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NULL AND s.SectionCode IS NOT NULL
                UNION ALL
                SELECT s.SlotName + N''|'' + COALESCE(secM.SectionCode, mepM.Section) AS pair
                FROM   dbo.Sessions s
                INNER  JOIN dbo.Attendance     aM   ON aM.SessionID = s.SessionID AND aM.IsPresent = 1 AND aM.ScannedAt IS NOT NULL
                INNER  JOIN dbo.MenteeProfiles mepM ON mepM.UserID  = aM.MenteeID
                INNER  JOIN dbo.MentorMentee   mmM  ON mmM.MenteeID = aM.MenteeID AND mmM.MentorID = s.MentorID AND mmM.IsActive = 1
                LEFT   JOIN dbo.Sections       secM ON secM.SectionID = mepM.SectionID
                WHERE  s.MentorID = u.UserID AND s.Status = ''Completed''
                  AND  s.SchoolYear = @SchoolYear AND s.Semester = @Semester
                  AND  s.RequestID IS NOT NULL AND s.SlotName IS NOT NULL
                  AND  COALESCE(secM.SectionCode, mepM.Section) IS NOT NULL
            ) t
        )                                                                                AS CompletedSessions,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s4.SlotName + N''|'' + s4.SectionCode AS pair
                FROM   dbo.Sessions s4
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NULL AND s4.SectionCode IS NOT NULL AND s4.Status <> ''Cancelled''
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = ''Submitted''
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = ''Deadline'' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
                UNION ALL
                SELECT s4.SlotName + N''|'' + COALESCE(sec4M.SectionCode, mep4M.Section) AS pair
                FROM   dbo.Sessions s4
                INNER  JOIN dbo.Attendance     a4M   ON a4M.SessionID = s4.SessionID AND a4M.IsPresent = 1 AND a4M.ScannedAt IS NOT NULL
                INNER  JOIN dbo.MenteeProfiles mep4M ON mep4M.UserID  = a4M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm4M  ON mm4M.MenteeID = a4M.MenteeID AND mm4M.MentorID = s4.MentorID AND mm4M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec4M ON sec4M.SectionID = mep4M.SectionID
                WHERE  s4.MentorID = u.UserID AND s4.SchoolYear = @SchoolYear AND s4.Semester = @Semester
                  AND  s4.RequestID IS NOT NULL AND s4.SlotName IS NOT NULL AND s4.Status <> ''Cancelled''
                  AND  s4.SubmittedAt IS NOT NULL AND s4.LogStatus = ''Submitted''
                  AND  COALESCE(sec4M.SectionCode, mep4M.Section) IS NOT NULL
                  AND  EXISTS (
                      SELECT 1 FROM dbo.CalendarEvents ce
                      WHERE ce.EventType = ''Deadline'' AND ce.SlotName = s4.SlotName
                        AND ce.SchoolYear = s4.SchoolYear AND ce.Semester = s4.Semester
                        AND s4.SubmittedAt <= ce.StartDate
                  )
            ) t
        )                                                                                AS OnTimeCount,
        (
            SELECT COUNT(DISTINCT pair) FROM (
                SELECT s5.SlotName + N''|'' + s5.SectionCode AS pair
                FROM   dbo.Sessions s5
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NULL AND s5.SectionCode IS NOT NULL AND s5.Status <> ''Cancelled''
                  AND  s5.LogStatus = ''Submitted''
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
                UNION ALL
                SELECT s5.SlotName + N''|'' + COALESCE(sec5M.SectionCode, mep5M.Section) AS pair
                FROM   dbo.Sessions s5
                INNER  JOIN dbo.Attendance     a5M   ON a5M.SessionID = s5.SessionID AND a5M.IsPresent = 1 AND a5M.ScannedAt IS NOT NULL
                INNER  JOIN dbo.MenteeProfiles mep5M ON mep5M.UserID  = a5M.MenteeID
                INNER  JOIN dbo.MentorMentee   mm5M  ON mm5M.MenteeID = a5M.MenteeID AND mm5M.MentorID = s5.MentorID AND mm5M.IsActive = 1
                LEFT   JOIN dbo.Sections       sec5M ON sec5M.SectionID = mep5M.SectionID
                WHERE  s5.MentorID = u.UserID AND s5.SchoolYear = @SchoolYear AND s5.Semester = @Semester
                  AND  s5.RequestID IS NOT NULL AND s5.SlotName IS NOT NULL AND s5.Status <> ''Cancelled''
                  AND  s5.LogStatus = ''Submitted''
                  AND  COALESCE(sec5M.SectionCode, mep5M.Section) IS NOT NULL
                  AND  EXISTS (SELECT 1 FROM dbo.ProofOfSession pos WHERE pos.SessionID = s5.SessionID)
            ) t
        )                                                                                AS CompleteCount
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
    LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
    WHERE  u.UserID = @MentorID AND u.IsActive = 1 AND u.Role = ''Mentor'';

    -- RS3: sessions list (includes ProofFilePath) -- FULL history, no
    -- period filter (see fix_mentor_detail_session_history.sql). Also
    -- returns SlotName/LogStatus/SubmittedAt so the frontend can show the
    -- same on-time/complete signal per row as the aggregate above.
    SELECT
        s.SessionID,
        COALESCE(sr.Purpose, s.Notes, ''Session'')                    AS Topic,
        s.Status, s.SessionDate, s.Notes,
        s.SchoolYear, s.Semester,
        s.SlotName, s.LogStatus, s.SubmittedAt,
        (SELECT COUNT(*)
         FROM   dbo.Attendance a
         JOIN   dbo.MenteeProfiles mep4 ON mep4.UserID = a.MenteeID
         WHERE  a.SessionID = s.SessionID AND a.IsPresent = 1 AND a.ScannedAt IS NOT NULL
           AND  ISNULL(mep4.IsDropOut, 0) = 0)                       AS PresentCount,
        CASE
            WHEN s.RequestID IS NOT NULL THEN
                (SELECT COUNT(DISTINCT sr2.MenteeID) FROM dbo.SessionRequests sr2
                 WHERE sr2.AvailabilityID = sr.AvailabilityID AND sr2.Status = ''Approved'')
            ELSE
                (SELECT COUNT(*)
                 FROM   dbo.MentorMentee    mm2
                 INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                 LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                 WHERE  mm2.MentorID = s.MentorID AND mm2.IsActive = 1
                   AND  ISNULL(mep2.IsDropOut, 0) = 0
                   AND  (s.SectionCode IS NULL
                         OR COALESCE(sec2.SectionCode, mep2.Section) = s.SectionCode))
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
    ORDER  BY s.SessionDate DESC;

    -- RS4: mentees with attendance stats + IsDropOut + SignatureFilePath
    -- (current-period progress figures -- unchanged), plus Email + Course +
    -- YearLevel for the mentee card (contact number deliberately left out
    -- -- see add_email_course_to_mentor_detail_mentees.sql, the fix this
    -- migration restores after scope_timeliness_to_due_checkpoints.sql
    -- accidentally reverted it).
    SELECT
        u.UserID          AS MenteeID,
        u.FirstName, u.LastName, u.StudentNumber, u.Email,
        mep.Course, mep.YearLevel,
        COALESCE(sec.SectionCode, mep.Section, N''-'')                AS SectionCode,
        ISNULL(mep.IsDropOut, 0)                                    AS IsDropOut,
        mep.SignatureFilePath,
        -- Per checkpoint, via the shared rules (dbo.fn_MenteeCheckpointAttendance).
        ISNULL(c.Attended, 0)                                        AS SessionsAttended,
        ISNULL(c.Expected, 0)                                        AS TotalCompleted,
        (SELECT MAX(sess.SessionDate) FROM dbo.Attendance a
         JOIN dbo.Sessions sess ON sess.SessionID = a.SessionID
         WHERE a.MenteeID = u.UserID AND sess.MentorID = @MentorID
           AND a.IsPresent = 1 AND a.ScannedAt IS NOT NULL
           AND sess.SchoolYear = @SchoolYear AND sess.Semester = @Semester)      AS LastAttended
    FROM   dbo.Users u
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = u.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = u.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN (
        SELECT MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
        WHERE  MentorID = @MentorID
        GROUP  BY MenteeID
    ) c ON c.MenteeID = u.UserID
    WHERE  u.IsActive = 1 AND u.Role = ''Mentee''
    ORDER  BY u.LastName, u.FirstName;
END;';
EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE dbo.sp_GetMentorMenteeAttendance
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''SchoolYear'';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''Semester'';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = ''2nd Semester''
                             THEN ''SessionLimit2ndSem'' ELSE ''SessionLimit1stSem'' END;

    -- RS1: session limit for current semester
    SELECT CASE WHEN @Semester=''2nd Semester'' THEN 5 ELSE 6 END AS RequiredSessions;

    -- RS2: mentor info with sections/courses
    SELECT
        u.UserID AS MentorID, u.FirstName, u.LastName, u.Email, mp.Department, mp.School,
        (
            SELECT STRING_AGG(val, '', '')
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
            SELECT STRING_AGG(val, '', '')
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

    -- RS3: mentee attendance cards (current semester), per checkpoint, using
    -- the shared rules in dbo.fn_MenteeCheckpointAttendance.
    SELECT
        ue.UserID                                                     AS MenteeID,
        ue.FirstName AS MenteeFirstName, ue.LastName AS MenteeLastName, ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N''-'')                  AS SectionCode,
        mep.Course, mep.YearLevel,
        ISNULL(c.Expected, 0)                                         AS TotalSessions,
        ISNULL(c.Attended, 0)                                         AS PresentCount
    FROM   dbo.Users ue
    INNER  JOIN dbo.MentorMentee   mm  ON mm.MenteeID = ue.UserID AND mm.MentorID = @MentorID AND mm.IsActive = 1
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN (
        SELECT MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
        WHERE  MentorID = @MentorID
        GROUP  BY MenteeID
    ) c ON c.MenteeID = ue.UserID
    WHERE  ue.IsActive = 1
    ORDER  BY ue.LastName, ue.FirstName;
END;';
EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE dbo.sp_GetAttendanceFullReport
    @School NVARCHAR(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''SchoolYear'';
    SELECT @Semester     = SettingValue FROM dbo.SystemSettings WHERE SettingKey = ''Semester'';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = ''2nd Semester''
                             THEN ''SessionLimit2ndSem'' ELSE ''SessionLimit1stSem'' END;

    -- RS1: session limit for current semester
    SELECT CASE WHEN @Semester=''2nd Semester'' THEN 5 ELSE 6 END AS RequiredSessions;

    -- RS2: one row per active mentor (filtered by school if provided)
    SELECT
        u.UserID    AS MentorID,
        u.FirstName, u.LastName,
        mp.Department, mp.School,
        COUNT(DISTINCT s.SessionID) AS TotalSessions
    FROM   dbo.Users u
    LEFT   JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT   JOIN dbo.Sessions       s  ON s.MentorID   = u.UserID
                                     AND s.Status      = ''Completed''
                                     AND s.SchoolYear  = @SchoolYear
                                     AND s.Semester    = @Semester
    WHERE  u.Role = ''mentor'' AND u.IsActive = 1
      AND  (@School IS NULL OR mp.School = @School)
    GROUP  BY u.UserID, u.FirstName, u.LastName, mp.Department, mp.School
    ORDER  BY u.LastName, u.FirstName;

    -- RS3: one row per mentee, for all mentors in RS2
    SELECT
        mm.MentorID,
        ue.UserID                                           AS MenteeID,
        ue.FirstName AS MenteeFirstName,
        ue.LastName  AS MenteeLastName,
        ue.StudentNumber,
        COALESCE(sec.SectionCode, mep.Section, N''-'')       AS SectionCode,
        mep.Course,
        mep.YearLevel,
        ISNULL(c.Expected, 0)                               AS TotalSessions,
        ISNULL(c.Attended, 0)                               AS PresentCount
    FROM   dbo.MentorMentee mm
    INNER  JOIN dbo.Users          um  ON um.UserID   = mm.MentorID AND um.Role = ''mentor'' AND um.IsActive = 1
    INNER  JOIN dbo.Users          ue  ON ue.UserID   = mm.MenteeID AND ue.IsActive = 1
    LEFT   JOIN dbo.MentorProfiles mp2 ON mp2.UserID  = mm.MentorID
    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = ue.UserID
    LEFT   JOIN dbo.Sections       sec ON sec.SectionID = mep.SectionID
    LEFT   JOIN (
        -- Per checkpoint, via the shared rules.
        SELECT MentorID, MenteeID, COUNT(*) AS Expected, SUM(Attended) AS Attended
        FROM   dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
        GROUP  BY MentorID, MenteeID
    ) c ON c.MentorID = mm.MentorID AND c.MenteeID = mm.MenteeID
    WHERE  mm.IsActive = 1
      AND  (@School IS NULL OR mp2.School = @School)
    ORDER  BY mm.MentorID, ue.LastName, ue.FirstName;
END;';
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
THROW;
END CATCH;