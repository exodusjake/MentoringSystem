-- READ-ONLY preview: mentors whose department has no school (e.g. SAS) but whose
-- profile still stores a school. These are the rows the APPLY script clears.
SET NOCOUNT ON;

SELECT mp.UserID, u.FirstName + ' ' + u.LastName AS Mentor, u.Role, u.IsActive,
       d.DepartmentName, mp.School AS StoredSchool
FROM dbo.MentorProfiles mp
JOIN dbo.Departments d ON d.DepartmentID = mp.DepartmentID
JOIN dbo.Users u ON u.UserID = mp.UserID
WHERE NULLIF(LTRIM(RTRIM(d.School)), '') IS NULL
  AND mp.School IS NOT NULL
ORDER BY mp.UserID;

SELECT COUNT(*) AS RowsToFix
FROM dbo.MentorProfiles mp
JOIN dbo.Departments d ON d.DepartmentID = mp.DepartmentID
WHERE NULLIF(LTRIM(RTRIM(d.School)), '') IS NULL
  AND mp.School IS NOT NULL;
