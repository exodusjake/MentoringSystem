-- REVIEW QUERY ONLY: not wired into reports or executed.
-- Parameterized @SchoolYear/@Semester must come from a validated selected period.
-- Requires reviewed assignment-history schema and reconciled verified intervals.
-- Preserve recorded source rows; return the earliest legitimate eligible scan,
-- shared by payable ownership and mentee checkpoint recognition. New mentors
-- never inherit another mentor's earning. Excluded unresolved records require
-- a reconciliation report before deployment; do not silently lower past earnings.
WITH Eligible AS (
  SELECT s.MentorID,s.SessionID,s.SlotName,s.SchoolYear,s.Semester,
         a.MenteeID,a.AttendanceID,a.ScannedAt
  FROM dbo.Sessions s JOIN dbo.Attendance a ON a.SessionID=s.SessionID
  WHERE s.SchoolYear=@SchoolYear AND s.Semester=@Semester
    AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
    AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
    AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
    AND EXISTS(SELECT 1 FROM dbo.CalendarEvents e
      WHERE e.EventType='Session Schedule' AND e.IsPublished=1
        AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
        AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
        AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
    AND EXISTS(SELECT 1 FROM dbo.MentorMentee mm
      WHERE mm.MentorID=s.MentorID AND mm.MenteeID=a.MenteeID
        AND mm.AssignmentSchoolYear=s.SchoolYear AND mm.HistoryVerified=1
        AND TODATETIMEOFFSET(a.ScannedAt,'+00:00')>=mm.EffectiveFrom
        AND (mm.EffectiveUntil IS NULL OR TODATETIMEOFFSET(a.ScannedAt,'+00:00')<mm.EffectiveUntil)
        AND (s.RequestID IS NOT NULL OR s.SectionCode IS NULL OR s.SectionCode=mm.SectionCodeAtAssignment))
), Owned AS (
  SELECT *,ROW_NUMBER() OVER(PARTITION BY MenteeID,SchoolYear,Semester,SlotName
    ORDER BY ScannedAt,SessionID,AttendanceID) AS CreditOrder,
    (SELECT COUNT(DISTINCT other.MentorID) FROM Eligible other
      WHERE other.MenteeID=credit.MenteeID AND other.SchoolYear=credit.SchoolYear
        AND other.Semester=credit.Semester AND other.SlotName=credit.SlotName
        AND other.ScannedAt=credit.ScannedAt) AS SameInstantMentors
  FROM Eligible credit
)
SELECT MentorID,MenteeID,SchoolYear,Semester,SlotName,SessionID,AttendanceID,ScannedAt,
       CASE WHEN SameInstantMentors>1 THEN 'Review simultaneous evidence' ELSE 'Earliest eligible earning' END OwnershipEvidence
FROM Owned WHERE CreditOrder=1;
-- Simultaneous cross-mentor scans must be reconciled before payment; the IDs
-- only stabilize evidence display, not authorize arbitrary payment ownership.
