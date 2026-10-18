-- Adds ASC, FCS and FSHS as departments with no school, like SAS, so their
-- mentors can be assigned mentees from any school. Safe to run more than once.
-- Rollback: SQL/add_school_departments_20261018.rollback.sql
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE DepartmentName = 'ASC')
    INSERT INTO dbo.Departments (DepartmentName, IsActive, School) VALUES ('ASC', 1, NULL);
IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE DepartmentName = 'FCS')
    INSERT INTO dbo.Departments (DepartmentName, IsActive, School) VALUES ('FCS', 1, NULL);
IF NOT EXISTS (SELECT 1 FROM dbo.Departments WHERE DepartmentName = 'FSHS')
    INSERT INTO dbo.Departments (DepartmentName, IsActive, School) VALUES ('FSHS', 1, NULL);

SELECT DepartmentID, DepartmentName, IsActive, ISNULL(School, '(no school)') AS School
FROM dbo.Departments
WHERE School IS NULL
ORDER BY DepartmentName;
