-- ============================================================
-- audit_attendance_accuracy.sql  (READ-ONLY)
--
-- Recomputes every active mentee's checkpoint attendance for the current
-- School Year/Semester straight from Sessions/Attendance/MentorMentee/
-- SessionRequests — independently of dbo.fn_MenteeCheckpointAttendance —
-- and compares it with what the portals report. Rules (same as the logsheet):
--   * regular session: counts for mentees of that session's section
--     (every mentee if the session has no section);
--   * make-up: counts for the mentee who booked it, and for any mentee
--     scanned present at it;
--   * only sessions on/after the FIRST time the mentee was assigned to their
--     current mentor;
--   * per checkpoint (SlotName).
-- Any row flagged other than "ok" is a real disagreement.
--
-- Runs inside a transaction that is rolled back. Needs QUOTED_IDENTIFIER ON
-- (sqlcmd -I).
-- ============================================================
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

DECLARE @SY  NVARCHAR(20) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
DECLARE @Sem NVARCHAR(50) = (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');
SELECT @SY AS SchoolYear, @Sem AS Semester, SYSUTCDATETIME() AS AuditedAtUtc;

SELECT mm.MentorID, mm.MenteeID, mm.AssignedDate,
       (SELECT MIN(h.AssignedDate) FROM dbo.MentorMentee h
        WHERE h.MenteeID = mm.MenteeID AND h.MentorID = mm.MentorID) AS FirstAssigned,
       COALESCE(sec.SectionCode, mep.Section) AS Section,
       mu.FirstName + ' ' + mu.LastName AS Mentor,
       u.FirstName  + ' ' + u.LastName  AS Mentee
INTO   #M
FROM   dbo.MentorMentee mm
JOIN   dbo.Users u  ON u.UserID  = mm.MenteeID AND u.IsActive = 1
JOIN   dbo.Users mu ON mu.UserID = mm.MentorID
LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID = mm.MenteeID
LEFT   JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
WHERE  mm.IsActive = 1;

SELECT s.SessionID, s.MentorID, s.SectionCode, s.SlotName, s.SessionDate, s.RequestID
INTO   #S
FROM   dbo.Sessions s
WHERE  s.Status = 'Completed' AND s.SchoolYear = @SY AND s.Semester = @Sem;

-- Independent recomputation, one row per (mentee, checkpoint).
SELECT m.MentorID, m.MenteeID,
       COALESCE(s.SlotName, N'#' + CAST(s.SessionID AS NVARCHAR(20))) AS CheckpointKey,
       MAX(CASE WHEN a.IsPresent = 1 THEN 1 ELSE 0 END) AS Attended
INTO   #Correct
FROM   #M m
JOIN   #S s ON s.MentorID = m.MentorID AND s.SessionDate >= m.FirstAssigned
LEFT   JOIN dbo.Attendance a ON a.SessionID = s.SessionID AND a.MenteeID = m.MenteeID
WHERE  (s.RequestID IS NULL AND (s.SectionCode IS NULL OR s.SectionCode = m.Section))
   OR  (s.RequestID IS NOT NULL
        AND (a.IsPresent = 1
             OR EXISTS (SELECT 1 FROM dbo.SessionRequests sr
                        WHERE sr.RequestID = s.RequestID AND sr.MenteeID = m.MenteeID AND sr.Status = 'Approved')))
GROUP  BY m.MentorID, m.MenteeID, COALESCE(s.SlotName, N'#' + CAST(s.SessionID AS NVARCHAR(20)));

-- What the portals use now.
SELECT MentorID, MenteeID, CheckpointKey, Attended
INTO   #Portal
FROM   dbo.fn_MenteeCheckpointAttendance(@SY, @Sem);

-- ── 1. Completed sessions this period ──
SELECT '1. COMPLETED SESSIONS' AS Section_;
SELECT s.SessionID, mu.FirstName + ' ' + mu.LastName AS Mentor, s.SectionCode, s.SlotName,
       CONVERT(VARCHAR(16), s.SessionDate, 120) AS SessionDate,
       CASE WHEN s.RequestID IS NULL THEN 'regular' ELSE 'make-up' END AS Kind,
       (SELECT COUNT(*) FROM dbo.Attendance a WHERE a.SessionID = s.SessionID AND a.IsPresent = 1) AS PresentRows
FROM   #S s JOIN dbo.Users mu ON mu.UserID = s.MentorID
ORDER  BY Mentor, s.SessionDate;

-- ── 2. Per mentee: correct vs portal (Attendance Logs, Mentor Monitoring,
--       mentee dashboard, CSV/print and dashboard tiers all read #Portal) ──
SELECT '2. PER MENTEE' AS Section_;
SELECT m.Mentor, m.Mentee, m.Section,
       CONVERT(VARCHAR(10), m.AssignedDate, 120)  AS StartDate,
       CONVERT(VARCHAR(10), m.FirstAssigned, 120) AS FirstAssigned,
       (SELECT COUNT(*)           FROM #Correct c WHERE c.MentorID = m.MentorID AND c.MenteeID = m.MenteeID) AS Correct_Expected,
       (SELECT ISNULL(SUM(Attended),0) FROM #Correct c WHERE c.MentorID = m.MentorID AND c.MenteeID = m.MenteeID) AS Correct_Attended,
       (SELECT COUNT(*)           FROM #Portal p WHERE p.MentorID = m.MentorID AND p.MenteeID = m.MenteeID) AS Portal_Expected,
       (SELECT ISNULL(SUM(Attended),0) FROM #Portal p WHERE p.MentorID = m.MentorID AND p.MenteeID = m.MenteeID) AS Portal_Attended,
       CASE WHEN m.AssignedDate <> m.FirstAssigned THEN 'START DATE NOT FIRST'
            WHEN EXISTS (SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Correct c
                         WHERE c.MentorID = m.MentorID AND c.MenteeID = m.MenteeID
                         EXCEPT
                         SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Portal p
                         WHERE p.MentorID = m.MentorID AND p.MenteeID = m.MenteeID)
              OR EXISTS (SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Portal p
                         WHERE p.MentorID = m.MentorID AND p.MenteeID = m.MenteeID
                         EXCEPT
                         SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Correct c
                         WHERE c.MentorID = m.MentorID AND c.MenteeID = m.MenteeID)
            THEN 'MISMATCH' ELSE 'ok' END AS Flag
FROM   #M m
ORDER  BY m.Mentor, m.Section, m.Mentee;

-- ── 3. Per mentor: Attendance Logs card totals (real procedure output) ──
SELECT '3. PER MENTOR (sp_GetAttendanceOverview vs correct)' AS Section_;
CREATE TABLE #Overview (MentorID INT, FirstName NVARCHAR(100), LastName NVARCHAR(100), Department NVARCHAR(200),
                        School NVARCHAR(200), TotalSessions INT, TotalAttendees INT, PresentCount INT,
                        LastSessionDate DATETIME2, Sections NVARCHAR(MAX), Courses NVARCHAR(MAX));
INSERT INTO #Overview EXEC dbo.sp_GetAttendanceOverview;
SELECT o.FirstName + ' ' + o.LastName AS Mentor,
       o.TotalSessions, (SELECT COUNT(*) FROM #S s WHERE s.MentorID = o.MentorID) AS Correct_Sessions,
       o.TotalAttendees AS Shown_Records, ISNULL(c.Recs, 0) AS Correct_Records,
       o.PresentCount   AS Shown_Present, ISNULL(c.Pres, 0) AS Correct_Present,
       CASE WHEN o.TotalAttendees = ISNULL(c.Recs, 0) AND o.PresentCount = ISNULL(c.Pres, 0)
                 AND o.TotalSessions = (SELECT COUNT(*) FROM #S s WHERE s.MentorID = o.MentorID)
            THEN 'ok' ELSE 'MISMATCH' END AS Flag
FROM   #Overview o
LEFT   JOIN (SELECT MentorID, COUNT(*) AS Recs, SUM(Attended) AS Pres FROM #Correct GROUP BY MentorID) c
       ON c.MentorID = o.MentorID
ORDER  BY Mentor;

-- ── 4. Integrity checks (each should return no rows) ──
SELECT '4a. Present but never scanned' AS Section_;
SELECT a.AttendanceID, a.SessionID, a.MenteeID FROM dbo.Attendance a
JOIN   #S s ON s.SessionID = a.SessionID
WHERE  a.IsPresent = 1 AND a.ScannedAt IS NULL;

SELECT '4b. Mentees with more than one active assignment' AS Section_;
SELECT MenteeID, COUNT(*) AS ActiveAssignments FROM dbo.MentorMentee
WHERE  IsActive = 1 GROUP BY MenteeID HAVING COUNT(*) > 1;

SELECT '4c. Present at a session of a mentor they were never assigned to' AS Section_;
SELECT a.SessionID, a.MenteeID, s.MentorID FROM dbo.Attendance a
JOIN   #S s ON s.SessionID = a.SessionID
WHERE  a.IsPresent = 1
  AND  NOT EXISTS (SELECT 1 FROM dbo.MentorMentee mm WHERE mm.MentorID = s.MentorID AND mm.MenteeID = a.MenteeID);

SELECT '5. SUMMARY' AS Section_;
SELECT (SELECT COUNT(*) FROM #M) AS MenteesChecked,
       (SELECT COUNT(*) FROM #Overview) AS MentorsChecked,
       (SELECT COUNT(*) FROM #M m
        WHERE m.AssignedDate <> m.FirstAssigned
           OR EXISTS (SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Correct c WHERE c.MenteeID = m.MenteeID AND c.MentorID = m.MentorID
                      EXCEPT SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Portal p WHERE p.MenteeID = m.MenteeID AND p.MentorID = m.MentorID)
           OR EXISTS (SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Portal p WHERE p.MenteeID = m.MenteeID AND p.MentorID = m.MentorID
                      EXCEPT SELECT MentorID, MenteeID, CheckpointKey, Attended FROM #Correct c WHERE c.MenteeID = m.MenteeID AND c.MentorID = m.MentorID)
       ) AS MenteeProblems;

ROLLBACK TRANSACTION;
SELECT 'Audit finished - nothing was changed (transaction rolled back).' AS Note;
