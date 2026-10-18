

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'CBMA')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('CBMA', 'School of Management', 1);

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'CTHM')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('CTHM', 'School of Management', 1);

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'CASE')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('CASE', 'School of Humanities', 1);

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'CHC')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('CHC', 'School of Humanities', 1);

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'CCJ')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('CCJ', 'School of Humanities', 1);
GO
