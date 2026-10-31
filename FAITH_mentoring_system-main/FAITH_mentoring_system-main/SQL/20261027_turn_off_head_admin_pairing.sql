-- 20261027_turn_off_head_admin_pairing.sql
--
-- Jake Head Admin (UserID 40) has the role Head, but still carries an old mentee profile and an old mentor pairing from
-- before his account was switched to Head. The pairing restore turned that old pairing (AssignmentID 4) back on, so he
-- appeared as a mentee of Henry Mendoza. This turns that one pairing off again. Nothing is deleted.
-- It commits only if exactly one row changed and no active pairing belongs to a non-mentee.

SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @Before INT = (SELECT COUNT(*) FROM dbo.MentorMentee WHERE IsActive = 1);

BEGIN TRANSACTION;
UPDATE mm SET IsActive = 0
FROM dbo.MentorMentee mm
JOIN dbo.Users u ON u.UserID = mm.MenteeID
WHERE mm.AssignmentID = 4 AND mm.MenteeID = 40 AND mm.IsActive = 1 AND u.Role = 'Head';
DECLARE @Changed INT = @@ROWCOUNT;

SELECT @Changed AS RowsChanged, @Before AS ActiveBefore, (SELECT COUNT(*) FROM dbo.MentorMentee WHERE IsActive = 1) AS ActiveAfter;
SELECT mentee.FirstName + ' ' + mentee.LastName AS Mentee, mentee.Role, mentor.FirstName + ' ' + mentor.LastName AS Mentor
FROM dbo.MentorMentee mm
JOIN dbo.Users mentee ON mentee.UserID = mm.MenteeID
JOIN dbo.Users mentor ON mentor.UserID = mm.MentorID
WHERE mm.IsActive = 1 ORDER BY mentee.LastName;

IF @Changed = 1 AND (SELECT COUNT(*) FROM dbo.MentorMentee WHERE IsActive = 1) = @Before - 1
   AND NOT EXISTS (SELECT 1 FROM dbo.MentorMentee mm JOIN dbo.Users u ON u.UserID = mm.MenteeID WHERE mm.IsActive = 1 AND u.Role <> 'Mentee')
BEGIN COMMIT TRANSACTION; PRINT 'RESULT: COMMITTED'; END
ELSE BEGIN ROLLBACK TRANSACTION; PRINT 'RESULT: ROLLED BACK - a check failed, nothing was changed'; END
