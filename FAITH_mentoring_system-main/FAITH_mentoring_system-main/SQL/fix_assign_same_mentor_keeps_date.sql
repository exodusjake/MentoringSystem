-- ============================================================
-- fix_assign_same_mentor_keeps_date.sql
--
-- Problem: sp_AssignMentor always ended the mentee's current assignment and
-- inserted a new one dated today — even when the mentor was unchanged (every
-- User Management save of a mentee, every CSV re-import). Attendance counts
-- only include sessions on/after MentorMentee.AssignedDate, so every re-save
-- silently dropped the mentee's earlier attended sessions from:
--   sp_GetMentorDetail, sp_GetMentorMenteeAttendance, sp_GetAttendanceOverview,
--   sp_GetAttendanceFullReport, sp_GetUserStats.
--
-- Part 1 makes re-saving the same mentor a no-op (safe, no data change).
-- Part 2 restores AssignedDate on current assignments to the start of their
-- unbroken same-mentor run. It only PREVIEWS unless @Apply is set to 1.
--
-- Run on each database (LocalDB and live RDS). Back up first.
-- Needs QUOTED_IDENTIFIER ON (SSMS default; sqlcmd needs -I): MentorMentee has
-- a filtered unique index, and the setting is stored with sp_AssignMentor.
-- Applied to live RDS 2026-09-28 (6 rows restored; backup table
-- dbo.MentorMentee_AssignedDate_Backup_20260928).
-- ============================================================

-- ── Part 1: keep the assignment when the mentor is unchanged ──
CREATE OR ALTER PROCEDURE dbo.sp_AssignMentor
    @MenteeID INT,
    @MentorID INT
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM dbo.MentorMentee WITH (UPDLOCK, HOLDLOCK)
                   WHERE MenteeID = @MenteeID AND MentorID = @MentorID AND IsActive = 1)
        BEGIN
            COMMIT TRANSACTION;
            RETURN;
        END;

        UPDATE dbo.MentorMentee SET IsActive = 0 WHERE MenteeID = @MenteeID;

        INSERT INTO dbo.MentorMentee (MentorID, MenteeID, AssignedDate, IsActive)
        VALUES (@MentorID, @MenteeID, GETDATE(), 1);

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

-- ── Part 2: restore dates reset by same-mentor re-saves ──
-- 0 = preview only (lists what would change). 1 = apply the change.
DECLARE @Apply BIT = 0;

IF OBJECT_ID('tempdb..#Restore') IS NOT NULL DROP TABLE #Restore;

-- Gaps-and-islands: consecutive assignments (by AssignmentID) with the same
-- mentor form one run; the active row gets that run's earliest date.
WITH ordered AS (
    SELECT AssignmentID, MenteeID, MentorID, AssignedDate, IsActive,
           ROW_NUMBER() OVER (PARTITION BY MenteeID ORDER BY AssignmentID)           AS rn,
           ROW_NUMBER() OVER (PARTITION BY MenteeID, MentorID ORDER BY AssignmentID) AS rnMentor
    FROM dbo.MentorMentee
), runs AS (
    SELECT *, rn - rnMentor AS runId FROM ordered
), runStart AS (
    SELECT MenteeID, MentorID, runId, MIN(AssignedDate) AS RunStart
    FROM runs GROUP BY MenteeID, MentorID, runId
)
SELECT r.AssignmentID, r.MenteeID, r.MentorID,
       r.AssignedDate AS CurrentAssignedDate, s.RunStart AS RestoredAssignedDate
INTO   #Restore
FROM   runs r
JOIN   runStart s ON s.MenteeID = r.MenteeID AND s.MentorID = r.MentorID AND s.runId = r.runId
WHERE  r.IsActive = 1 AND s.RunStart < r.AssignedDate;

SELECT x.AssignmentID,
       mentee.FirstName + ' ' + mentee.LastName AS Mentee,
       mentor.FirstName + ' ' + mentor.LastName AS Mentor,
       x.CurrentAssignedDate, x.RestoredAssignedDate
FROM   #Restore x
JOIN   dbo.Users mentee ON mentee.UserID = x.MenteeID
JOIN   dbo.Users mentor ON mentor.UserID = x.MentorID
ORDER  BY Mentor, Mentee;

IF @Apply = 1
BEGIN
    BEGIN TRANSACTION;
    UPDATE mm SET mm.AssignedDate = x.RestoredAssignedDate
    FROM   dbo.MentorMentee mm
    JOIN   #Restore x ON x.AssignmentID = mm.AssignmentID;
    SELECT @@ROWCOUNT AS RowsUpdated;
    COMMIT TRANSACTION;
END
ELSE
    SELECT 'Preview only - nothing changed. Set @Apply = 1 to restore these dates.' AS Note;

DROP TABLE #Restore;
GO
