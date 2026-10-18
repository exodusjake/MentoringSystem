-- add_islate_to_mentor_slots.sql
--
-- Posting an Availability slot outside its checkpoint's Session Schedule
-- window (or for a checkpoint Admin hasn't scheduled at all) used to be
-- hard-rejected. Per the mentor's own feedback, that's inconsistent with
-- how the rest of the system treats lateness (a late logsheet submission
-- is still allowed, just scored as late) -- so posting is never blocked
-- anymore (see AvailabilityWorkflowService.AddSlotAsync). This adds the
-- "Late" signal back as a computed, read-time flag instead of a write-time
-- rejection, same "missing = worst" philosophy already used for Timeliness
-- and Evaluation Rating: no matching window at all also counts as late,
-- since there's nothing to prove it was on schedule.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE OR ALTER PROCEDURE dbo.sp_GetMentorSlots
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear NVARCHAR(20) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'SchoolYear');
    DECLARE @Semester   NVARCHAR(50) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'Semester');

    SELECT
        a.AvailabilityID, a.AvailableDate, a.StartTime, a.EndTime, a.SlotName,
        CASE
            WHEN EXISTS (SELECT 1 FROM dbo.SessionRequests sr2
                         WHERE sr2.AvailabilityID = a.AvailabilityID AND sr2.Status = 'Pending')
            THEN 'Pending' ELSE 'Open'
        END AS SlotStatus,
        CASE
            WHEN a.SlotName IS NULL THEN CAST(0 AS BIT)  -- legacy slot, predates checkpoints
            WHEN NOT EXISTS (
                SELECT 1 FROM dbo.CalendarEvents ce
                WHERE ce.EventType = 'Session Schedule' AND ce.SlotName = a.SlotName
                  AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester
            ) THEN CAST(1 AS BIT)  -- Admin hasn't scheduled this checkpoint -- can't prove on-time
            WHEN EXISTS (
                SELECT 1 FROM dbo.CalendarEvents ce
                WHERE ce.EventType = 'Session Schedule' AND ce.SlotName = a.SlotName
                  AND ce.SchoolYear = @SchoolYear AND ce.Semester = @Semester
                  AND a.AvailableDate > ce.EndDate
            ) THEN CAST(1 AS BIT)
            ELSE CAST(0 AS BIT)
        END AS IsLate,
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
