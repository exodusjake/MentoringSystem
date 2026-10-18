-- =============================================================
-- AstraMentoring System — DB Migration & Seed Script
-- Default password for ALL seeded accounts: Faith@2026
-- Run this in SSMS against the AstraMentoring database.
-- Safe to re-run: all inserts use IF NOT EXISTS guards.
-- =============================================================
USE AstraMentoring;
GO

-- ── STEP 1: Add Gender column ─────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Users') AND name = 'Gender')
    ALTER TABLE Users ADD Gender NVARCHAR(10) NULL;
GO

-- ── STEP 2: Departments ──────────────────────────────────────
-- Base schools
IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'School of Technology')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('School of Technology', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'School of Humanities')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('School of Humanities', 'School of Humanities', 1);

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'School of Management')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('School of Management', 'School of Management', 1);

-- Sub-departments under School of Technology
IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'COE')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('COE', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Departments WHERE DepartmentName = 'CCIT')
    INSERT INTO Departments (DepartmentName, School, IsActive)
    VALUES ('CCIT', 'School of Technology', 1);
GO

-- ── STEP 3: Sections ─────────────────────────────────────────
-- CCIT courses
IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS IT 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS IT 1A', 'BS IT', '1st Year', 'A', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS IT 1B' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS IT 1B', 'BS IT', '1st Year', 'B', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS CS 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS CS 1A', 'BS CS', '1st Year', 'A', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS EMC 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS EMC 1A', 'BS EMC', '1st Year', 'A', 'School of Technology', 1);

-- COE courses
IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS IE 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS IE 1A', 'BS IE', '1st Year', 'A', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS IE 1B' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS IE 1B', 'BS IE', '1st Year', 'B', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS EE 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS EE 1A', 'BS EE', '1st Year', 'A', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS EE 1B' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS EE 1B', 'BS EE', '1st Year', 'B', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS CPE 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS CPE 1A', 'BS CPE', '1st Year', 'A', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS CPE 1B' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS CPE 1B', 'BS CPE', '1st Year', 'B', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS ECE 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS ECE 1A', 'BS ECE', '1st Year', 'A', 'School of Technology', 1);

IF NOT EXISTS (SELECT 1 FROM Sections WHERE SectionCode = 'BS MULTIMEDIA 1A' AND IsActive = 1)
    INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School, IsActive)
    VALUES ('BS MULTIMEDIA 1A', 'BS MULTIMEDIA', '1st Year', 'A', 'School of Technology', 1);
GO

-- ── STEP 4: Mentors & Sample Mentees ─────────────────────────
-- Password: SHA-256 of 'Faith@2026' encoded as Base64 (auth fallback)
DECLARE @pwd  NVARCHAR(200);
DECLARE @hash VARBINARY(32) = HASHBYTES('SHA2_256', CAST('Faith@2026' AS VARCHAR(100)));
DECLARE @hex  NVARCHAR(64)  = UPPER(CONVERT(NVARCHAR(64), @hash, 2));
SET @pwd = CAST(N'' AS XML).value('xs:base64Binary(xs:hexBinary(sql:variable("@hex")))', 'NVARCHAR(MAX)');

DECLARE @sy  NVARCHAR(20) = ISNULL((SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'SchoolYear'),  '2026-2027');
DECLARE @sem NVARCHAR(30) = ISNULL((SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'Semester'),    '1st Semester');

DECLARE @deptCOE  INT = (SELECT DepartmentID FROM Departments WHERE DepartmentName = 'COE'  AND IsActive = 1);
DECLARE @deptCCIT INT = (SELECT DepartmentID FROM Departments WHERE DepartmentName = 'CCIT' AND IsActive = 1);

DECLARE @secIT1A   INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IT 1A'        AND IsActive = 1);
DECLARE @secIT1B   INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IT 1B'        AND IsActive = 1);
DECLARE @secCS1A   INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS CS 1A'        AND IsActive = 1);
DECLARE @secEMC1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS EMC 1A'       AND IsActive = 1);
DECLARE @secIE1A   INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IE 1A'        AND IsActive = 1);
DECLARE @secIE1B   INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IE 1B'        AND IsActive = 1);
DECLARE @secEE1A   INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS EE 1A'        AND IsActive = 1);
DECLARE @secEE1B   INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS EE 1B'        AND IsActive = 1);
DECLARE @secCPE1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS CPE 1A'       AND IsActive = 1);
DECLARE @secCPE1B  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS CPE 1B'       AND IsActive = 1);
DECLARE @secECE1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS ECE 1A'       AND IsActive = 1);
DECLARE @secMULT1A INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS MULTIMEDIA 1A' AND IsActive = 1);

DECLARE @uid INT; -- reused per inserted user

-- ==============================================================
-- COE MENTORS
-- ==============================================================

-- ── BS IE 1A ──────────────────────────────────────────────────
-- M01 Alejandro, Marco Aurelio — handles male mentees in IE 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ma.alejandro@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Marco Aurelio','Alejandro','ma.alejandro@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00001',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- M02 Mercado, Jeneca — handles female mentees in IE 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'j.mercado@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Jeneca','Mercado','j.mercado@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00002',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- ── BS IE 1B ──────────────────────────────────────────────────
-- M03 Tuliao, Unisse — handles male mentees in IE 1B
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'u.tuliao@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Unisse','Tuliao','u.tuliao@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00003',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- M04 Simanca, Kezia Francesca — handles female mentees in IE 1B
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'kf.simanca@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Kezia Francesca','Simanca','kf.simanca@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00004',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- ── BS EE 1A ──────────────────────────────────────────────────
-- M05 Almendras, Melan Dyrene — handles female mentees in EE 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'md.almendras@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Melan Dyrene','Almendras','md.almendras@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00005',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- M06 Valenzuela, Darren — handles male mentees in EE 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'd.valenzuela@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Darren','Valenzuela','d.valenzuela@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00006',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- ── BS EE 1B ──────────────────────────────────────────────────
-- M07 Arante, Kaye Dyrel — handles female mentees in EE 1B
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'kd.arante@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Kaye Dyrel','Arante','kd.arante@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00007',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- M08 Mendoza, John Michael — handles male mentees in EE 1B
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jm.mendoza@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('John Michael','Mendoza','jm.mendoza@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00008',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- ── BS CPE 1A ─────────────────────────────────────────────────
-- M09 Gutierrez, Cherrie Lou — handles female mentees in CPE 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'cl.gutierrez@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Cherrie Lou','Gutierrez','cl.gutierrez@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00009',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- M10 Burdeos, Marco — handles male mentees in CPE 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'm.burdeos@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Marco','Burdeos','m.burdeos@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00010',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- ── BS CPE 1B + BS MULTIMEDIA 1A ─────────────────────────────
-- M11 Cornejo, Reniel — handles male mentees in CPE 1B AND MULTIMEDIA 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'r.cornejo@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Reniel','Cornejo','r.cornejo@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00011',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- M12 Guevarra, Alvin — handles male mentees in CPE 1B
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'a.guevarra@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Alvin','Guevarra','a.guevarra@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00012',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- ── BS ECE 1A ─────────────────────────────────────────────────
-- M13 Simbahan, Jolina — handles female mentees in ECE 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'j.simbahan@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Jolina','Simbahan','j.simbahan@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00013',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'COE','School of Technology',@deptCOE);
END

-- ==============================================================
-- CCIT MENTORS
-- ==============================================================

-- ── BS IT 1A ──────────────────────────────────────────────────
-- M14 Elec, Judith — handles female mentees in IT 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'j.elec@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Judith','Elec','j.elec@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00014',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- M15 Calanog, Vince — handles male mentees in IT 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'v.calanog@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Vince','Calanog','v.calanog@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00015',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- ── BS IT 1B ──────────────────────────────────────────────────
-- M16 Evangelista, Angelica — handles female mentees in IT 1B
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'a.evangelista@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Angelica','Evangelista','a.evangelista@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00016',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- M17 Salsona, Ade Carl — handles male mentees in IT 1B
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ac.salsona@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Ade Carl','Salsona','ac.salsona@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00017',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- ── BS CS 1A ──────────────────────────────────────────────────
-- M18 Manaig, Aron Jet — handles male mentees in CS 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'aj.manaig@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Aron Jet','Manaig','aj.manaig@firstasia.edu.ph',@pwd,'Mentor','Male','2022-00018',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- M19 Farafoldane, Nikka Ysabel — handles female mentees in CS 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ny.farafoldane@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Nikka Ysabel','Farafoldane','ny.farafoldane@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00019',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- ── BS EMC 1A ─────────────────────────────────────────────────
-- M20 Orpilla, Gerlie — handles female mentees in EMC 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'g.orpilla@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Gerlie','Orpilla','g.orpilla@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00020',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- M21 Galicia, Xandra Yvon — handles female mentees in EMC 1A
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'xy.galicia@firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Xandra Yvon','Galicia','xy.galicia@firstasia.edu.ph',@pwd,'Mentor','Female','2022-00021',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MentorProfiles (UserID,Department,School,DepartmentID) VALUES (@uid,'CCIT','School of Technology',@deptCCIT);
END

-- ==============================================================
-- SAMPLE MENTEES  (3 per mentor, gender-segregated per section)
-- Pattern: insert User → MenteeProfile → MentorMentee assignment
-- Note: Cornejo also handles BS MULTIMEDIA 1A (cross-course)
-- ==============================================================

-- helper macro (inline):
-- INSERT mentee then assign:
--   INSERT INTO MentorMentee SELECT mentor_uid, @uid, GETDATE(), 1
--   WHERE NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1)

-- ── IE 1A — Male group (Mentor: Alejandro) ───────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jandrei.cruz@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Jose Andrei','Cruz','jandrei.cruz@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00001',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1A','School of Technology',@deptCOE,@secIE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ma.alejandro@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'mangelo.santos@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Mark Angelo','Santos','mangelo.santos@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00002',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1A','School of Technology',@deptCOE,@secIE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ma.alejandro@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'cmiguel.reyes@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Carlo Miguel','Reyes','cmiguel.reyes@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00003',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1A','School of Technology',@deptCOE,@secIE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ma.alejandro@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── IE 1A — Female group (Mentor: Mercado) ───────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'mana.delacruz@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Maria Ana','Dela Cruz','mana.delacruz@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00004',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1A','School of Technology',@deptCOE,@secIE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.mercado@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ngrace.villanueva@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Nicole Grace','Villanueva','ngrace.villanueva@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00005',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1A','School of Technology',@deptCOE,@secIE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.mercado@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'pjoy.ocampo@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Patricia Joy','Ocampo','pjoy.ocampo@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00006',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1A','School of Technology',@deptCOE,@secIE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.mercado@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── IE 1B — Male group (Mentor: Tuliao) ──────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'gjose.torres@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Gabriel Jose','Torres','gjose.torres@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00007',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1B','School of Technology',@deptCOE,@secIE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='u.tuliao@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jrey.ramos@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Joshua Rey','Ramos','jrey.ramos@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00008',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1B','School of Technology',@deptCOE,@secIE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='u.tuliao@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'dfrancis.bautista@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Daniel Francis','Bautista','dfrancis.bautista@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00009',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1B','School of Technology',@deptCOE,@secIE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='u.tuliao@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── IE 1B — Female group (Mentor: Simanca) ───────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'rmarie.hernandez@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Rachel Marie','Hernandez','rmarie.hernandez@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00010',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1B','School of Technology',@deptCOE,@secIE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='kf.simanca@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'crose.lopez@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Camille Rose','Lopez','crose.lopez@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00011',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1B','School of Technology',@deptCOE,@secIE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='kf.simanca@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'afaye.perez@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Angela Faye','Perez','afaye.perez@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00012',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IE','1st Year','BS IE 1B','School of Technology',@deptCOE,@secIE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='kf.simanca@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── EE 1A — Female group (Mentor: Almendras) ─────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jjoy.manalo@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Jasmine Joy','Manalo','jjoy.manalo@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00013',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1A','School of Technology',@deptCOE,@secEE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='md.almendras@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'cann.cabrera@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Christine Ann','Cabrera','cann.cabrera@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00014',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1A','School of Technology',@deptCOE,@secEE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='md.almendras@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'dmae.francisco@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Diana Mae','Francisco','dmae.francisco@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00015',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1A','School of Technology',@deptCOE,@secEE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='md.almendras@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── EE 1A — Male group (Mentor: Valenzuela) ──────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'rjames.serrano@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Roel James','Serrano','rjames.serrano@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00016',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1A','School of Technology',@deptCOE,@secEE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='d.valenzuela@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'dray.castillo@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Dennis Ray','Castillo','dray.castillo@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00017',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1A','School of Technology',@deptCOE,@secEE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='d.valenzuela@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'bjoseph.dalmacio@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Bernard Joseph','Dalmacio','bjoseph.dalmacio@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00018',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1A','School of Technology',@deptCOE,@secEE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='d.valenzuela@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── EE 1B — Female group (Mentor: Arante) ────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'hkristine.espiritu@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Hannah Kristine','Espiritu','hkristine.espiritu@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00019',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1B','School of Technology',@deptCOE,@secEE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='kd.arante@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'bjoy.paglinawan@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Bernadette Joy','Paglinawan','bjoy.paglinawan@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00020',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1B','School of Technology',@deptCOE,@secEE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='kd.arante@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'mgrace.soriano@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Monica Grace','Soriano','mgrace.soriano@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00021',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1B','School of Technology',@deptCOE,@secEE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='kd.arante@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── EE 1B — Male group (Mentor: Mendoza) ─────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'fcarlo.tan@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Francis Carlo','Tan','fcarlo.tan@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00022',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1B','School of Technology',@deptCOE,@secEE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='jm.mendoza@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'candre.lim@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Christian Andre','Lim','candre.lim@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00023',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1B','School of Technology',@deptCOE,@secEE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='jm.mendoza@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ljames.aquino@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Lemuel James','Aquino','ljames.aquino@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00024',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EE','1st Year','BS EE 1B','School of Technology',@deptCOE,@secEE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='jm.mendoza@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── CPE 1A — Female group (Mentor: Gutierrez) ────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'rfaye.aguilar@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Rowena Faye','Aguilar','rfaye.aguilar@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00025',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1A','School of Technology',@deptCOE,@secCPE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='cl.gutierrez@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'cann.deguzman@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Clarice Ann','De Guzman','cann.deguzman@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00026',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1A','School of Technology',@deptCOE,@secCPE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='cl.gutierrez@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'mrose.domingo@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Michelle Rose','Domingo','mrose.domingo@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00027',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1A','School of Technology',@deptCOE,@secCPE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='cl.gutierrez@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── CPE 1A — Male group (Mentor: Burdeos) ────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'arey.uy@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Antonio Rey','Uy','arey.uy@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00028',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1A','School of Technology',@deptCOE,@secCPE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='m.burdeos@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'rfrancis.yap@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Roberto Francis','Yap','rfrancis.yap@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00029',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1A','School of Technology',@deptCOE,@secCPE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='m.burdeos@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jmartin.zapanta@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Joel Martin','Zapanta','jmartin.zapanta@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00030',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1A','School of Technology',@deptCOE,@secCPE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='m.burdeos@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── CPE 1B — Male group (Mentor: Cornejo) ────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'mray.santos.cpe@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Michael Ray','Santos','mray.santos.cpe@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00031',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1B','School of Technology',@deptCOE,@secCPE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='r.cornejo@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ivan.cruz.cpe@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Ivan Jose','Cruz','ivan.cruz.cpe@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00032',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1B','School of Technology',@deptCOE,@secCPE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='r.cornejo@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── CPE 1B — Male group (Mentor: Guevarra) ───────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ljohn.lim.cpe@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Lawrence John','Lim','ljohn.lim.cpe@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00033',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1B','School of Technology',@deptCOE,@secCPE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='a.guevarra@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ejames.tan.cpe@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Erwin James','Tan','ejames.tan.cpe@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00034',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1B','School of Technology',@deptCOE,@secCPE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='a.guevarra@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'bpaul.aquino.cpe@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Benedict Paul','Aquino','bpaul.aquino.cpe@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00035',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CPE','1st Year','BS CPE 1B','School of Technology',@deptCOE,@secCPE1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='a.guevarra@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── MULTIMEDIA 1A — Male group (Mentor: Cornejo, cross-course) ─
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'acarlo.reyes.mult@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Adrian Carlo','Reyes','acarlo.reyes.mult@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00036',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS MULTIMEDIA','1st Year','BS MULTIMEDIA 1A','School of Technology',@deptCOE,@secMULT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='r.cornejo@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'rmiguel.garcia.mult@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Renz Miguel','Garcia','rmiguel.garcia.mult@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00037',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS MULTIMEDIA','1st Year','BS MULTIMEDIA 1A','School of Technology',@deptCOE,@secMULT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='r.cornejo@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── ECE 1A — Female group (Mentor: Simbahan) ─────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jkay.manalo.ece@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Josephine Kay','Manalo','jkay.manalo.ece@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00038',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS ECE','1st Year','BS ECE 1A','School of Technology',@deptCOE,@secECE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.simbahan@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'lea.santos.ece@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Lea Marie','Santos','lea.santos.ece@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00039',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS ECE','1st Year','BS ECE 1A','School of Technology',@deptCOE,@secECE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.simbahan@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'rjoy.torres.ece@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Rona Joy','Torres','rjoy.torres.ece@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00040',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS ECE','1st Year','BS ECE 1A','School of Technology',@deptCOE,@secECE1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.simbahan@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── IT 1A — Female group (Mentor: Elec) ──────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'mae.cruz.it1a@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Mae Anne','Cruz','mae.cruz.it1a@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00041',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1A','School of Technology',@deptCCIT,@secIT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.elec@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jjoy.reyes.it1a@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Jessa Joy','Reyes','jjoy.reyes.it1a@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00042',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1A','School of Technology',@deptCCIT,@secIT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.elec@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'krose.garcia.it1a@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Karla Rose','Garcia','krose.garcia.it1a@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00043',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1A','School of Technology',@deptCCIT,@secIT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='j.elec@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── IT 1A — Male group (Mentor: Calanog) ─────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jcarlo.santos.it1a@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Jed Carlo','Santos','jcarlo.santos.it1a@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00044',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1A','School of Technology',@deptCCIT,@secIT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='v.calanog@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'rmiguel.deguzman.it1a@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Ryan Miguel','De Guzman','rmiguel.deguzman.it1a@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00045',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1A','School of Technology',@deptCCIT,@secIT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='v.calanog@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'manthony.lopez.it1a@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Marc Anthony','Lopez','manthony.lopez.it1a@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00046',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1A','School of Technology',@deptCCIT,@secIT1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='v.calanog@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── IT 1B — Female group (Mentor: Evangelista) ───────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'sgrace.villanueva.it1b@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Sophia Grace','Villanueva','sgrace.villanueva.it1b@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00047',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1B','School of Technology',@deptCCIT,@secIT1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='a.evangelista@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'tjoy.ocampo.it1b@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Trisha Joy','Ocampo','tjoy.ocampo.it1b@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00048',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1B','School of Technology',@deptCCIT,@secIT1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='a.evangelista@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'pmarie.hernandez.it1b@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Pia Marie','Hernandez','pmarie.hernandez.it1b@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00049',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1B','School of Technology',@deptCCIT,@secIT1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='a.evangelista@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── IT 1B — Male group (Mentor: Salsona) ─────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'jfrancis.bautista.it1b@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Jude Francis','Bautista','jfrancis.bautista.it1b@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00050',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1B','School of Technology',@deptCCIT,@secIT1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ac.salsona@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'djoseph.ramos.it1b@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Dave Joseph','Ramos','djoseph.ramos.it1b@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00051',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1B','School of Technology',@deptCCIT,@secIT1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ac.salsona@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ipatrick.torres.it1b@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Ian Patrick','Torres','ipatrick.torres.it1b@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00052',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS IT','1st Year','BS IT 1B','School of Technology',@deptCCIT,@secIT1B);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ac.salsona@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── CS 1A — Male group (Mentor: Manaig) ──────────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'lcarl.perez.cs@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Louie Carl','Perez','lcarl.perez.cs@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00053',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CS','1st Year','BS CS 1A','School of Technology',@deptCCIT,@secCS1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='aj.manaig@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'ralph.manalo.cs@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Ralph Anthony','Manalo','ralph.manalo.cs@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00054',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CS','1st Year','BS CS 1A','School of Technology',@deptCCIT,@secCS1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='aj.manaig@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'bryan.castillo.cs@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Bryan James','Castillo','bryan.castillo.cs@student.firstasia.edu.ph',@pwd,'Mentee','Male','2025-00055',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CS','1st Year','BS CS 1A','School of Technology',@deptCCIT,@secCS1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='aj.manaig@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── CS 1A — Female group (Mentor: Farafoldane) ───────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'alyssa.francisco.cs@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Alyssa Marie','Francisco','alyssa.francisco.cs@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00056',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CS','1st Year','BS CS 1A','School of Technology',@deptCCIT,@secCS1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ny.farafoldane@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'bianca.espiritu.cs@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Bianca Joy','Espiritu','bianca.espiritu.cs@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00057',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CS','1st Year','BS CS 1A','School of Technology',@deptCCIT,@secCS1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ny.farafoldane@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'carla.soriano.cs@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Carla Rose','Soriano','carla.soriano.cs@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00058',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS CS','1st Year','BS CS 1A','School of Technology',@deptCCIT,@secCS1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='ny.farafoldane@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── EMC 1A — Female group (Mentor: Orpilla) ──────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'denise.paglinawan.emc@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Denise Faye','Paglinawan','denise.paglinawan.emc@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00059',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EMC','1st Year','BS EMC 1A','School of Technology',@deptCCIT,@secEMC1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='g.orpilla@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'eva.deguzman.emc@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Eva Grace','De Guzman','eva.deguzman.emc@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00060',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EMC','1st Year','BS EMC 1A','School of Technology',@deptCCIT,@secEMC1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='g.orpilla@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'faith.cabrera.emc@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Faith Joy','Cabrera','faith.cabrera.emc@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00061',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EMC','1st Year','BS EMC 1A','School of Technology',@deptCCIT,@secEMC1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='g.orpilla@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ── EMC 1A — Female group (Mentor: Galicia) ──────────────────
IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'gina.uy.emc@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Gina Marie','Uy','gina.uy.emc@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00062',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EMC','1st Year','BS EMC 1A','School of Technology',@deptCCIT,@secEMC1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='xy.galicia@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'helen.yap.emc@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Helen Ann','Yap','helen.yap.emc@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00063',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EMC','1st Year','BS EMC 1A','School of Technology',@deptCCIT,@secEMC1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='xy.galicia@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

IF NOT EXISTS (SELECT 1 FROM Users WHERE Email = 'iris.zapanta.emc@student.firstasia.edu.ph')
BEGIN
    INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,StudentNumber,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
    VALUES ('Iris Joy','Zapanta','iris.zapanta.emc@student.firstasia.edu.ph',@pwd,'Mentee','Female','2025-00064',1,GETDATE(),GETDATE(),@sy,@sem);
    SET @uid = SCOPE_IDENTITY();
    INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,DepartmentID,SectionID)
    VALUES (@uid,'BS EMC','1st Year','BS EMC 1A','School of Technology',@deptCCIT,@secEMC1A);
    INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive)
    SELECT UserID,@uid,GETDATE(),1 FROM Users WHERE Email='xy.galicia@firstasia.edu.ph'
    AND NOT EXISTS (SELECT 1 FROM MentorMentee WHERE MenteeID=@uid AND IsActive=1);
END

-- ==============================================================
-- VERIFICATION — quick counts
-- ==============================================================
SELECT 'Departments'  AS [Table], COUNT(*) AS [Rows] FROM Departments WHERE IsActive = 1
UNION ALL
SELECT 'Sections',   COUNT(*) FROM Sections   WHERE IsActive = 1
UNION ALL
SELECT 'Mentors',    COUNT(*) FROM Users u INNER JOIN MentorProfiles mp ON mp.UserID=u.UserID WHERE u.IsActive=1
UNION ALL
SELECT 'Mentees',    COUNT(*) FROM Users u INNER JOIN MenteeProfiles me ON me.UserID=u.UserID WHERE u.IsActive=1
UNION ALL
SELECT 'Assignments',COUNT(*) FROM MentorMentee WHERE IsActive = 1;
GO
