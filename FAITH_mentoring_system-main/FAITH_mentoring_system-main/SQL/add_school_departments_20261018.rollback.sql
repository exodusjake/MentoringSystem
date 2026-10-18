-- Removes the ASC, FCS and FSHS departments added by add_school_departments_20261018.sql.
-- A department that a mentor already belongs to is kept, so no profile loses its department.
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

DELETE d FROM dbo.Departments d
WHERE d.DepartmentName IN ('ASC', 'FCS', 'FSHS')
  AND d.School IS NULL
  AND NOT EXISTS (SELECT 1 FROM dbo.MentorProfiles mp WHERE mp.DepartmentID = d.DepartmentID)
  AND NOT EXISTS (SELECT 1 FROM dbo.MenteeProfiles me WHERE me.DepartmentID = d.DepartmentID);
SELECT @@ROWCOUNT AS DepartmentsRemoved;

SELECT d.DepartmentName, COUNT(mp.UserID) AS MentorsStillUsingIt
FROM dbo.Departments d LEFT JOIN dbo.MentorProfiles mp ON mp.DepartmentID = d.DepartmentID
WHERE d.DepartmentName IN ('ASC', 'FCS', 'FSHS')
GROUP BY d.DepartmentName;
