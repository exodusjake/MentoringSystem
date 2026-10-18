-- Adds the SAS department. It belongs to no school, so its mentors can be
-- assigned mentees from any school (Admin > User Management handles this).
-- Safe to run more than once.
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE DepartmentName = 'SAS')
    INSERT INTO dbo.Departments (DepartmentName, IsActive, School) VALUES ('SAS', 1, NULL);

SELECT DepartmentID, DepartmentName, IsActive, ISNULL(School, '(no school)') AS School
FROM dbo.Departments
ORDER BY School, DepartmentName;
