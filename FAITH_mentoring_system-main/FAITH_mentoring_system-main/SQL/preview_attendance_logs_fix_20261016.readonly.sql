-- READ-ONLY preview: Attendance Logs numbers now (live code) vs after the fix, for every mentor and mentee.
SET NOCOUNT ON;
DECLARE @SchoolYear NVARCHAR(20), @Semester NVARCHAR(50);
SELECT @SchoolYear = SettingValue FROM SystemSettings WHERE SettingKey = 'SchoolYear';
SELECT @Semester   = SettingValue FROM SystemSettings WHERE SettingKey = 'Semester';

-- 1) Every mentee card: attended now vs after
WITH OldExp AS (
        SELECT s.MentorID,mm.MenteeID,s.SlotName,
            MAX(CASE WHEN a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND scanWindow.Events>0 THEN 1 ELSE 0 END) Attended
        FROM Sessions s JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
        JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
        LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=mm.MenteeID
        OUTER APPLY(SELECT COUNT(*) Events FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
          AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
          AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)) scanWindow
        WHERE s.MentorID IN (SELECT UserID FROM Users WHERE Role='Mentor' AND IsActive=1) AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
          AND ISNULL(mp.IsDropOut,0)=0 AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
          AND (EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=mm.MenteeID)
             OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND
               ((s.RequestID IS NULL AND (s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section)))
                OR (s.RequestID IS NOT NULL AND (a.IsPresent=1 OR EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.RequestID=s.RequestID AND sr.MenteeID=mm.MenteeID AND sr.Status='Approved'))))))
          AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
            AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        GROUP BY s.MentorID,mm.MenteeID,s.SlotName
        
), Expected AS (
        
        SELECT s.MentorID,mm.MenteeID,s.SlotName,
            MAX(CASE WHEN a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND scanWindow.Events>0 THEN 1 ELSE 0 END) Attended
        FROM Sessions s JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
        JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
        LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=mm.MenteeID
        OUTER APPLY(SELECT COUNT(*) Events FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
          AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
          AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)) scanWindow
        WHERE s.MentorID IN (SELECT UserID FROM Users WHERE Role='Mentor' AND IsActive=1) AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
          AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
          AND (EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=mm.MenteeID)
             OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND
               ((s.RequestID IS NULL AND (s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section)))
                OR (s.RequestID IS NOT NULL AND (a.IsPresent=1 OR EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.RequestID=s.RequestID AND sr.MenteeID=mm.MenteeID AND sr.Status='Approved'))))))
          AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
            AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        GROUP BY s.MentorID,mm.MenteeID,s.SlotName
        
        ), Credit AS (
            SELECT DISTINCT a.MenteeID,s.SlotName FROM Sessions s
            JOIN Attendance a ON a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
            WHERE s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
              AND s.SlotName IS NOT NULL AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
              AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        ), MenteeRows AS (
            SELECT e.MentorID,e.MenteeID,e.SlotName,
                CASE WHEN e.Attended=1 OR EXISTS(SELECT 1 FROM Credit c WHERE c.MenteeID=e.MenteeID AND c.SlotName=e.SlotName) THEN 1 ELSE 0 END Attended
            FROM Expected e
            UNION ALL
            SELECT mm.MentorID,mm.MenteeID,c.SlotName,1
            FROM MentorMentee mm JOIN Credit c ON c.MenteeID=mm.MenteeID
            WHERE mm.MentorID IN (SELECT UserID FROM Users WHERE Role='Mentor' AND IsActive=1) AND mm.IsActive=1
              AND NOT EXISTS(SELECT 1 FROM Expected e WHERE e.MentorID=mm.MentorID AND e.MenteeID=mm.MenteeID AND e.SlotName=c.SlotName)
        )
, NewRows AS (SELECT r.MentorID,r.MenteeID,r.SlotName,r.Attended FROM MenteeRows r
        JOIN Users u ON u.UserID=r.MenteeID AND u.IsActive=1
), Scoped AS (SELECT DISTINCT s.MentorID FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE s.SchoolYear=@SchoolYear AND s.Semester=@Semester
), OldRows AS (
    SELECT o.MentorID,o.MenteeID,o.SlotName,o.Attended FROM OldExp o WHERE o.MentorID IN (SELECT MentorID FROM Scoped)
    UNION ALL
    SELECT f.MentorID,f.MenteeID,f.CheckpointKey,f.Attended FROM dbo.fn_MenteeCheckpointAttendance(@SchoolYear,@Semester) f
    WHERE f.MentorID NOT IN (SELECT MentorID FROM Scoped)
)
SELECT mu.FirstName+' '+mu.LastName AS Mentor, eu.FirstName+' '+eu.LastName AS Mentee, mm.MenteeID,
       ISNULL(mep.IsDropOut,0) AS DropOut,
       ISNULL((SELECT SUM(o.Attended) FROM OldRows o WHERE o.MentorID=mm.MentorID AND o.MenteeID=mm.MenteeID),0) AS AttendedNow,
       ISNULL((SELECT SUM(n.Attended) FROM NewRows n WHERE n.MentorID=mm.MentorID AND n.MenteeID=mm.MenteeID),0) AS AttendedAfter,
       CASE WHEN ISNULL((SELECT SUM(o.Attended) FROM OldRows o WHERE o.MentorID=mm.MentorID AND o.MenteeID=mm.MenteeID),0)
              <> ISNULL((SELECT SUM(n.Attended) FROM NewRows n WHERE n.MentorID=mm.MentorID AND n.MenteeID=mm.MenteeID),0)
            THEN 'CHANGED' ELSE '' END AS Diff
FROM MentorMentee mm
JOIN Users mu ON mu.UserID=mm.MentorID AND mu.IsActive=1 AND mu.Role='Mentor'
JOIN Users eu ON eu.UserID=mm.MenteeID AND eu.IsActive=1
LEFT JOIN MenteeProfiles mep ON mep.UserID=mm.MenteeID
WHERE mm.IsActive=1
ORDER BY Mentor, Mentee;

-- 2) Every mentor card and top stats: checkpoint records and present, now vs after
WITH OldExp AS (
        SELECT s.MentorID,mm.MenteeID,s.SlotName,
            MAX(CASE WHEN a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND scanWindow.Events>0 THEN 1 ELSE 0 END) Attended
        FROM Sessions s JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
        JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
        LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=mm.MenteeID
        OUTER APPLY(SELECT COUNT(*) Events FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
          AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
          AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)) scanWindow
        WHERE s.MentorID IN (SELECT UserID FROM Users WHERE Role='Mentor' AND IsActive=1) AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
          AND ISNULL(mp.IsDropOut,0)=0 AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
          AND (EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=mm.MenteeID)
             OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND
               ((s.RequestID IS NULL AND (s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section)))
                OR (s.RequestID IS NOT NULL AND (a.IsPresent=1 OR EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.RequestID=s.RequestID AND sr.MenteeID=mm.MenteeID AND sr.Status='Approved'))))))
          AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
            AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        GROUP BY s.MentorID,mm.MenteeID,s.SlotName
        
), Expected AS (
        
        SELECT s.MentorID,mm.MenteeID,s.SlotName,
            MAX(CASE WHEN a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND scanWindow.Events>0 THEN 1 ELSE 0 END) Attended
        FROM Sessions s JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
        JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
        LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=mm.MenteeID
        OUTER APPLY(SELECT COUNT(*) Events FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
          AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
          AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)) scanWindow
        WHERE s.MentorID IN (SELECT UserID FROM Users WHERE Role='Mentor' AND IsActive=1) AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
          AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
          AND (EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=mm.MenteeID)
             OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND
               ((s.RequestID IS NULL AND (s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section)))
                OR (s.RequestID IS NOT NULL AND (a.IsPresent=1 OR EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.RequestID=s.RequestID AND sr.MenteeID=mm.MenteeID AND sr.Status='Approved'))))))
          AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
            AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        GROUP BY s.MentorID,mm.MenteeID,s.SlotName
        
        ), Credit AS (
            SELECT DISTINCT a.MenteeID,s.SlotName FROM Sessions s
            JOIN Attendance a ON a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
            WHERE s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
              AND s.SlotName IS NOT NULL AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
              AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        ), MenteeRows AS (
            SELECT e.MentorID,e.MenteeID,e.SlotName,
                CASE WHEN e.Attended=1 OR EXISTS(SELECT 1 FROM Credit c WHERE c.MenteeID=e.MenteeID AND c.SlotName=e.SlotName) THEN 1 ELSE 0 END Attended
            FROM Expected e
            UNION ALL
            SELECT mm.MentorID,mm.MenteeID,c.SlotName,1
            FROM MentorMentee mm JOIN Credit c ON c.MenteeID=mm.MenteeID
            WHERE mm.MentorID IN (SELECT UserID FROM Users WHERE Role='Mentor' AND IsActive=1) AND mm.IsActive=1
              AND NOT EXISTS(SELECT 1 FROM Expected e WHERE e.MentorID=mm.MentorID AND e.MenteeID=mm.MenteeID AND e.SlotName=c.SlotName)
        )
, NewRows AS (SELECT r.MentorID,r.MenteeID,r.SlotName,r.Attended FROM MenteeRows r
        JOIN Users u ON u.UserID=r.MenteeID AND u.IsActive=1
), Scoped AS (SELECT DISTINCT s.MentorID FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE s.SchoolYear=@SchoolYear AND s.Semester=@Semester
), OldRows AS (
    SELECT o.MentorID,o.MenteeID,o.SlotName,o.Attended FROM OldExp o WHERE o.MentorID IN (SELECT MentorID FROM Scoped)
    UNION ALL
    SELECT f.MentorID,f.MenteeID,f.CheckpointKey,f.Attended FROM dbo.fn_MenteeCheckpointAttendance(@SchoolYear,@Semester) f
    WHERE f.MentorID NOT IN (SELECT MentorID FROM Scoped)
)
SELECT mu.FirstName+' '+mu.LastName AS Mentor,
       (SELECT COUNT(*) FROM Sessions s WHERE s.MentorID=mu.UserID AND s.Status='Completed' AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester) AS SessionsBadge,
       (SELECT COUNT(*) FROM OldRows o WHERE o.MentorID=mu.UserID) AS RecordsNow,
       ISNULL((SELECT SUM(o.Attended) FROM OldRows o WHERE o.MentorID=mu.UserID),0) AS PresentNow,
       (SELECT COUNT(*) FROM NewRows n WHERE n.MentorID=mu.UserID) AS RecordsAfter,
       ISNULL((SELECT SUM(n.Attended) FROM NewRows n WHERE n.MentorID=mu.UserID),0) AS PresentAfter
FROM Users mu WHERE mu.Role='Mentor' AND mu.IsActive=1
ORDER BY Mentor;

-- 3) Raw evidence: every present scan this period, and whether it falls in its schedule window
SELECT s.SessionID, mu.FirstName+' '+mu.LastName AS SessionMentor, s.SlotName, s.SessionDate, s.Status, s.TimeEnd,
       a.MenteeID, eu.FirstName+' '+eu.LastName AS Mentee, a.ScannedAt,
       (SELECT TOP 1 m2.FirstName+' '+m2.LastName FROM MentorMentee mm2 JOIN Users m2 ON m2.UserID=mm2.MentorID WHERE mm2.MenteeID=a.MenteeID AND mm2.IsActive=1) AS CurrentMentor,
       CASE WHEN EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1
            AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
            AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
            AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
            THEN 'in window' ELSE 'OUTSIDE window' END AS ScanWindow
FROM Attendance a JOIN Sessions s ON s.SessionID=a.SessionID
JOIN Users mu ON mu.UserID=s.MentorID JOIN Users eu ON eu.UserID=a.MenteeID
WHERE a.IsPresent=1 AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester
ORDER BY s.SessionDate;
