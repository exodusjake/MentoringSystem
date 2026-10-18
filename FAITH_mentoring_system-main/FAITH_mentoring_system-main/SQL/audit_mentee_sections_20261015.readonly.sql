-- READ-ONLY: every active mentee should be linked to its course's Sections row.
SET NOCOUNT ON;
SELECT u.UserID, u.FirstName + ' ' + u.LastName AS Mentee, mp.School, mp.Course, mp.SectionID,
       s.SectionCode, s.School AS SectionSchool,
       CASE WHEN s.SectionID IS NULL THEN 'NOT LINKED'
            WHEN s.SectionCode <> UPPER(mp.Course) THEN 'WRONG COURSE'
            ELSE 'ok' END AS Status
FROM dbo.Users u
JOIN dbo.MenteeProfiles mp ON mp.UserID = u.UserID
LEFT JOIN dbo.Sections s ON s.SectionID = mp.SectionID
WHERE u.IsActive = 1 AND u.Role = 'Mentee'
ORDER BY CASE WHEN s.SectionID IS NULL OR s.SectionCode <> UPPER(mp.Course) THEN 0 ELSE 1 END, u.UserID;
