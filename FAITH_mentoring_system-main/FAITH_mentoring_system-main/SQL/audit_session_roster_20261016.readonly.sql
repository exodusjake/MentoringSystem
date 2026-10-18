-- READ-ONLY: why some of Zephyr's mentees are not on session 1177's roster.
SET NOCOUNT ON;

-- The session and when it was created
SELECT SessionID, MentorID, SlotName, SessionDate, CreatedAt, TimeEnd, Status FROM Sessions WHERE SessionID = 1177;

-- Who is on its roster
SELECT SessionID, MenteeID, School, CourseCode FROM SessionCourseMembers WHERE SessionID = 1177;

-- Zephyr's current mentees: account creation and assignment
SELECT u.UserID, u.FirstName + ' ' + u.LastName AS Mentee, u.CreatedAt AS AccountCreated, mm.AssignedDate,
       mep.School, mep.Course, mep.IsDropOut
FROM MentorMentee mm JOIN Users u ON u.UserID = mm.MenteeID
LEFT JOIN MenteeProfiles mep ON mep.UserID = mm.MenteeID
WHERE mm.MentorID = 311 AND mm.IsActive = 1 ORDER BY u.UserID;

-- Notifications sent to them (assignment notices carry the exact time)
SELECT n.RecipientUserID, n.Type, n.Message, n.CreatedAt FROM Notifications n
WHERE n.RecipientUserID IN (254, 310, 312, 313) ORDER BY n.RecipientUserID, n.CreatedAt;
