-- ============================================================
-- ASTRA MENTORING SYSTEM — DB REALIGNMENT & SEED DATA
-- Run against: AstraMentoring database
-- Default password for all seeded accounts: Faith@2026
-- ============================================================
USE AstraMentoring;
GO

-- ── STEP 1: SCHEMA CHANGES ───────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
               WHERE TABLE_NAME='Users' AND COLUMN_NAME='Gender')
    ALTER TABLE Users ADD Gender NVARCHAR(10) NULL;
GO

-- ── STEP 2: CLEANUP (preserves Admin accounts) ───────────────
DELETE FROM ProofOfSession;
DELETE FROM EvaluationLinks;
DELETE FROM Notifications;
DELETE FROM Announcements WHERE PostedByUserID IN (
    SELECT UserID FROM Users WHERE Role IN ('Mentor','Mentee'));
DELETE FROM MentorMentee;
DELETE FROM Attendance;
DELETE FROM SessionRequests;
DELETE FROM Sessions;
DELETE FROM Availability;
DELETE FROM MentorProfiles;
DELETE FROM MenteeProfiles;
DELETE FROM Users WHERE Role IN ('Mentor', 'Mentee');
DELETE FROM Sections;
DELETE FROM Departments;
GO

-- ── STEP 3: DEPARTMENTS ──────────────────────────────────────
INSERT INTO Departments (DepartmentName, School, IsActive) VALUES
('School of Technology', 'School of Technology', 1),
('School of Humanities', 'School of Humanities', 1),
('School of Management', 'School of Management', 1),
('COE',                  'School of Technology', 1),
('CCIT',                 'School of Technology', 1);
GO

-- ── STEP 4: SECTIONS ─────────────────────────────────────────
INSERT INTO Sections (SectionCode, Course, YearLevel, SectionLetter, School) VALUES
-- COE
('BS IE 1A',         'BS IE',         '1st Year', 'A', 'School of Technology'),
('BS IE 1B',         'BS IE',         '1st Year', 'B', 'School of Technology'),
('BS EE 1A',         'BS EE',         '1st Year', 'A', 'School of Technology'),
('BS EE 1B',         'BS EE',         '1st Year', 'B', 'School of Technology'),
('BS CPE 1A',        'BS CPE',        '1st Year', 'A', 'School of Technology'),
('BS CPE 1B',        'BS CPE',        '1st Year', 'B', 'School of Technology'),
('BS MULTIMEDIA 1A', 'BS MULTIMEDIA', '1st Year', 'A', 'School of Technology'),
('BS ECE 1A',        'BS ECE',        '1st Year', 'A', 'School of Technology'),
-- CCIT
('BS IT 1A',         'BS IT',         '1st Year', 'A', 'School of Technology'),
('BS IT 1B',         'BS IT',         '1st Year', 'B', 'School of Technology'),
('BS CS 1A',         'BS CS',         '1st Year', 'A', 'School of Technology'),
('BS EMC 1A',        'BS EMC',        '1st Year', 'A', 'School of Technology'),
('BS EMC 1B',        'BS EMC',        '1st Year', 'B', 'School of Technology');
GO

-- ── STEP 5: SEED MENTORS ─────────────────────────────────────
DECLARE @COE  INT = (SELECT DepartmentID FROM Departments WHERE DepartmentName = 'COE');
DECLARE @CCIT INT = (SELECT DepartmentID FROM Departments WHERE DepartmentName = 'CCIT');
DECLARE @SY   NVARCHAR(20) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'SchoolYear');
DECLARE @SM   NVARCHAR(30) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'Semester');
DECLARE @Pwd  VARCHAR(300);
SELECT @Pwd = (SELECT HASHBYTES('SHA2_256', 'Faith@2026') FOR XML PATH(''), BINARY BASE64);
DECLARE @UID  INT;

-- ── COE MENTORS ──────────────────────────────────────────────

-- 1. Alejandro, Marco Aurelio — BS IE 1A, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Marco Aurelio','Alejandro','marco.alejandro@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Industrial Engineering');

-- 2. Mercado, Jeneca — BS IE 1A, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Jeneca','Mercado','jeneca.mercado@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Industrial Engineering');

-- 3. Tuliao, Unisse — BS IE 1B, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Unisse','Tuliao','unisse.tuliao@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Industrial Engineering');

-- 4. Simanca, Kezia Francesca — BS IE 1B, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Kezia Francesca','Simanca','kezia.simanca@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Industrial Engineering');

-- 5. Almendras, Melan Dyrene — BS EE 1A, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Melan Dyrene','Almendras','melan.almendras@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Electrical Engineering');

-- 6. Valenzuela, Darren — BS EE 1A, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Darren','Valenzuela','darren.valenzuela@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Electrical Engineering');

-- 7. Arante, Kaye Dyrel — BS EE 1B, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Kaye Dyrel','Arante','kaye.arante@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Electrical Engineering');

-- 8. Mendoza, John Michael — BS EE 1B, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('John Michael','Mendoza','johnmichael.mendoza@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Electrical Engineering');

-- 9. Gutierrez, Cherrie Lou — BS CPE 1A, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Cherrie Lou','Gutierrez','cherrielou.gutierrez@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Computer Engineering');

-- 10. Burdeos, Marco — BS CPE 1A, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Marco','Burdeos','marco.burdeos@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Computer Engineering');

-- 11. Cornejo, Reniel — BS CPE 1B + BS MULTIMEDIA 1A, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Reniel','Cornejo','reniel.cornejo@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Computer Engineering, Multimedia');

-- 12. Guevarra, Alvin — BS CPE 1B, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Alvin','Guevarra','alvin.guevarra@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Computer Engineering');

-- 13. Simbahan, Jolina — BS ECE 1A, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Jolina','Simbahan','jolina.simbahan@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','COE',@COE,'FAITH College Mentor','Electronics Engineering');

-- ── CCIT MENTORS ─────────────────────────────────────────────

-- 14. Elec, Judith — BS IT 1A, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Judith','Elec','judith.elec@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Information Technology');

-- 15. Evangelista, Angelica — BS IT 1B, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Angelica','Evangelista','angelica.evangelista@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Information Technology');

-- 16. Calanog, Vince — BS IT 1A, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Vince','Calanog','vince.calanog@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Information Technology');

-- 17. Salsona, Ade Carl — BS IT 1B, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Ade Carl','Salsona','adecaol.salsona@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Information Technology');

-- 18. Manaig, Aron Jet — BS CS 1A, Male
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Aron Jet','Manaig','aronjet.manaig@faith.edu.ph',@Pwd,'Mentor','Male',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Computer Science');

-- 19. Farafoldane, Nikka Ysabel — BS CS 1A, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Nikka Ysabel','Farafoldane','nikka.farafoldane@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Computer Science');

-- 20. Orpilla, Gerlie — BS EMC 1A, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Gerlie','Orpilla','gerlie.orpilla@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Entertainment & Multimedia Computing');

-- 21. Galicia, Xandra Yvon — BS EMC 1B, Female
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester)
VALUES ('Xandra Yvon','Galicia','xandra.galicia@faith.edu.ph',@Pwd,'Mentor','Female',1,GETDATE(),GETDATE(),@SY,@SM);
SET @UID = SCOPE_IDENTITY();
INSERT INTO MentorProfiles (UserID,School,Department,DepartmentID,Bio,Expertise)
VALUES (@UID,'School of Technology','CCIT',@CCIT,'FAITH College Mentor','Entertainment & Multimedia Computing');
GO

-- ── STEP 6: SEED MENTEES + ASSIGNMENTS ──────────────────────
DECLARE @COE  INT = (SELECT DepartmentID FROM Departments WHERE DepartmentName = 'COE');
DECLARE @CCIT INT = (SELECT DepartmentID FROM Departments WHERE DepartmentName = 'CCIT');
DECLARE @SY   NVARCHAR(20) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'SchoolYear');
DECLARE @SM   NVARCHAR(30) = (SELECT SettingValue FROM SystemSettings WHERE SettingKey = 'Semester');
DECLARE @Pwd  VARCHAR(300);
SELECT @Pwd = (SELECT HASHBYTES('SHA2_256', 'Faith@2026') FOR XML PATH(''), BINARY BASE64);

DECLARE @IE1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IE 1A');
DECLARE @IE1B  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IE 1B');
DECLARE @EE1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS EE 1A');
DECLARE @EE1B  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS EE 1B');
DECLARE @CPE1A INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS CPE 1A');
DECLARE @CPE1B INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS CPE 1B');
DECLARE @MM1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS MULTIMEDIA 1A');
DECLARE @ECE1A INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS ECE 1A');
DECLARE @IT1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IT 1A');
DECLARE @IT1B  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS IT 1B');
DECLARE @CS1A  INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS CS 1A');
DECLARE @EMC1A INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS EMC 1A');
DECLARE @EMC1B INT = (SELECT SectionID FROM Sections WHERE SectionCode = 'BS EMC 1B');

DECLARE @UID INT;

-- Mentor IDs (looked up by email)
DECLARE @M1  INT = (SELECT UserID FROM Users WHERE Email='marco.alejandro@faith.edu.ph');      -- BS IE 1A Male
DECLARE @M2  INT = (SELECT UserID FROM Users WHERE Email='jeneca.mercado@faith.edu.ph');        -- BS IE 1A Female
DECLARE @M3  INT = (SELECT UserID FROM Users WHERE Email='unisse.tuliao@faith.edu.ph');         -- BS IE 1B Female
DECLARE @M4  INT = (SELECT UserID FROM Users WHERE Email='kezia.simanca@faith.edu.ph');         -- BS IE 1B Female
DECLARE @M5  INT = (SELECT UserID FROM Users WHERE Email='melan.almendras@faith.edu.ph');       -- BS EE 1A Female
DECLARE @M6  INT = (SELECT UserID FROM Users WHERE Email='darren.valenzuela@faith.edu.ph');     -- BS EE 1A Male
DECLARE @M7  INT = (SELECT UserID FROM Users WHERE Email='kaye.arante@faith.edu.ph');           -- BS EE 1B Female
DECLARE @M8  INT = (SELECT UserID FROM Users WHERE Email='johnmichael.mendoza@faith.edu.ph');   -- BS EE 1B Male
DECLARE @M9  INT = (SELECT UserID FROM Users WHERE Email='cherrielou.gutierrez@faith.edu.ph'); -- BS CPE 1A Female
DECLARE @M10 INT = (SELECT UserID FROM Users WHERE Email='marco.burdeos@faith.edu.ph');         -- BS CPE 1A Male
DECLARE @M11 INT = (SELECT UserID FROM Users WHERE Email='reniel.cornejo@faith.edu.ph');        -- BS CPE 1B + MM 1A Male
DECLARE @M12 INT = (SELECT UserID FROM Users WHERE Email='alvin.guevarra@faith.edu.ph');        -- BS CPE 1B Male
DECLARE @M13 INT = (SELECT UserID FROM Users WHERE Email='jolina.simbahan@faith.edu.ph');       -- BS ECE 1A Female
DECLARE @M14 INT = (SELECT UserID FROM Users WHERE Email='judith.elec@faith.edu.ph');           -- BS IT 1A Female
DECLARE @M15 INT = (SELECT UserID FROM Users WHERE Email='angelica.evangelista@faith.edu.ph');  -- BS IT 1B Female
DECLARE @M16 INT = (SELECT UserID FROM Users WHERE Email='vince.calanog@faith.edu.ph');         -- BS IT 1A Male
DECLARE @M17 INT = (SELECT UserID FROM Users WHERE Email='adecaol.salsona@faith.edu.ph');       -- BS IT 1B Male
DECLARE @M18 INT = (SELECT UserID FROM Users WHERE Email='aronjet.manaig@faith.edu.ph');        -- BS CS 1A Male
DECLARE @M19 INT = (SELECT UserID FROM Users WHERE Email='nikka.farafoldane@faith.edu.ph');     -- BS CS 1A Female
DECLARE @M20 INT = (SELECT UserID FROM Users WHERE Email='gerlie.orpilla@faith.edu.ph');        -- BS EMC 1A Female
DECLARE @M21 INT = (SELECT UserID FROM Users WHERE Email='xandra.galicia@faith.edu.ph');        -- BS EMC 1B Female

-- ──────────────────────────────────────────────────────────────
-- BS IE 1A — MALE GROUP (Mentor: Alejandro)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Juan Carlo','De Leon','juancarlo.deleon@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00101');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1A','School of Technology','COE',@COE,@IE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M1,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Miguel','Santos','miguel.santos.ie@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00102');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1A','School of Technology','COE',@COE,@IE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M1,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ramon','Cruz','ramon.cruz.ie@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00103');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1A','School of Technology','COE',@COE,@IE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M1,@UID,GETDATE(),1);

-- BS IE 1A — FEMALE GROUP (Mentor: Mercado)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Maria','Reyes','maria.reyes.ie@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00104');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1A','School of Technology','COE',@COE,@IE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M2,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ana','Garcia','ana.garcia.ie@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00105');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1A','School of Technology','COE',@COE,@IE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M2,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Sofia','Torres','sofia.torres.ie@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00106');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1A','School of Technology','COE',@COE,@IE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M2,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS IE 1B — FEMALE GROUP A (Mentor: Tuliao)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Isabel','Ramos','isabel.ramos.ie@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00107');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1B','School of Technology','COE',@COE,@IE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M3,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Camille','Flores','camille.flores.ie@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00108');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1B','School of Technology','COE',@COE,@IE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M3,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Grace','Lim','grace.lim.ie@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00109');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1B','School of Technology','COE',@COE,@IE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M3,@UID,GETDATE(),1);

-- BS IE 1B — FEMALE GROUP B (Mentor: Simanca)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Nicole','Mendez','nicole.mendez.ie@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00110');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1B','School of Technology','COE',@COE,@IE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M4,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Christine','Villanueva','christine.villanueva@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00111');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1B','School of Technology','COE',@COE,@IE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M4,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Beatrice','Aguilar','beatrice.aguilar@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00112');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IE','1st Year','1B','School of Technology','COE',@COE,@IE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M4,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS EE 1A — FEMALE GROUP (Mentor: Almendras)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Patricia','Dela Cruz','patricia.delacruz@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00113');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1A','School of Technology','COE',@COE,@EE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M5,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Lovely','Castillo','lovely.castillo@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00114');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1A','School of Technology','COE',@COE,@EE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M5,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Jasmine','Morales','jasmine.morales@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00115');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1A','School of Technology','COE',@COE,@EE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M5,@UID,GETDATE(),1);

-- BS EE 1A — MALE GROUP (Mentor: Valenzuela)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Kevin','Santos','kevin.santos.ee@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00116');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1A','School of Technology','COE',@COE,@EE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M6,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Paul','Reyes','paul.reyes.ee@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00117');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1A','School of Technology','COE',@COE,@EE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M6,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('James','Cruz','james.cruz.ee@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00118');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1A','School of Technology','COE',@COE,@EE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M6,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS EE 1B — FEMALE GROUP (Mentor: Arante)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Michelle','Garcia','michelle.garcia@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00119');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1B','School of Technology','COE',@COE,@EE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M7,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Abigail','Torres','abigail.torres@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00120');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1B','School of Technology','COE',@COE,@EE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M7,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Rina','Ramos','rina.ramos.ee@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00121');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1B','School of Technology','COE',@COE,@EE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M7,@UID,GETDATE(),1);

-- BS EE 1B — MALE GROUP (Mentor: Mendoza)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Aaron','Lopez','aaron.lopez@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00122');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1B','School of Technology','COE',@COE,@EE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M8,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Francis','Bautista','francis.bautista@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00123');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1B','School of Technology','COE',@COE,@EE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M8,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Christian','Catalan','christian.catalan@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00124');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EE','1st Year','1B','School of Technology','COE',@COE,@EE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M8,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS CPE 1A — FEMALE GROUP (Mentor: Gutierrez)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Sophia','Cruz','sophia.cruz.cpe@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00125');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1A','School of Technology','COE',@COE,@CPE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M9,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Angela','Santos','angela.santos.cpe@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00126');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1A','School of Technology','COE',@COE,@CPE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M9,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Diane','Reyes','diane.reyes.cpe@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00127');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1A','School of Technology','COE',@COE,@CPE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M9,@UID,GETDATE(),1);

-- BS CPE 1A — MALE GROUP (Mentor: Burdeos)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Mark','Dela Cruz','mark.delacruz.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00128');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1A','School of Technology','COE',@COE,@CPE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M10,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Daniel','Lim','daniel.lim.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00129');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1A','School of Technology','COE',@COE,@CPE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M10,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ryan','Ong','ryan.ong.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00130');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1A','School of Technology','COE',@COE,@CPE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M10,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS CPE 1B — MALE GROUP A (Mentor: Cornejo)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Jerome','Tan','jerome.tan.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00131');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1B','School of Technology','COE',@COE,@CPE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M11,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Patrick','Lim','patrick.lim.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00132');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1B','School of Technology','COE',@COE,@CPE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M11,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Bernard','Go','bernard.go.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00133');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1B','School of Technology','COE',@COE,@CPE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M11,@UID,GETDATE(),1);

-- BS CPE 1B — MALE GROUP B (Mentor: Guevarra)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Kenneth','Chua','kenneth.chua.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00134');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1B','School of Technology','COE',@COE,@CPE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M12,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Raphael','Uy','raphael.uy.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00135');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1B','School of Technology','COE',@COE,@CPE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M12,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Albert','Sy','albert.sy.cpe@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00136');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CPE','1st Year','1B','School of Technology','COE',@COE,@CPE1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M12,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS MULTIMEDIA 1A — MALE GROUP (Mentor: Cornejo — same as CPE 1B)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ian','Santos','ian.santos.mm@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00137');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS MULTIMEDIA','1st Year','1A','School of Technology','COE',@COE,@MM1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M11,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Jay','Dela Rosa','jay.delarosa@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00138');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS MULTIMEDIA','1st Year','1A','School of Technology','COE',@COE,@MM1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M11,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Leo','Perez','leo.perez.mm@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00139');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS MULTIMEDIA','1st Year','1A','School of Technology','COE',@COE,@MM1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M11,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS ECE 1A — FEMALE GROUP (Mentor: Simbahan)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Hannah','Cruz','hannah.cruz.ece@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00140');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS ECE','1st Year','1A','School of Technology','COE',@COE,@ECE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M13,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ella','Torres','ella.torres.ece@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00141');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS ECE','1st Year','1A','School of Technology','COE',@COE,@ECE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M13,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Mia','Santos','mia.santos.ece@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00142');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS ECE','1st Year','1A','School of Technology','COE',@COE,@ECE1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M13,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS IT 1A — FEMALE GROUP (Mentor: Elec)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Kim','Reyes','kim.reyes.it@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00143');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1A','School of Technology','CCIT',@CCIT,@IT1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M14,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Bea','Garcia','bea.garcia.it@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00144');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1A','School of Technology','CCIT',@CCIT,@IT1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M14,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Joy','Lim','joy.lim.it@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00145');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1A','School of Technology','CCIT',@CCIT,@IT1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M14,@UID,GETDATE(),1);

-- BS IT 1A — MALE GROUP (Mentor: Calanog)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Jan','Santos','jan.santos.it@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00146');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1A','School of Technology','CCIT',@CCIT,@IT1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M16,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Rex','Cruz','rex.cruz.it@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00147');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1A','School of Technology','CCIT',@CCIT,@IT1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M16,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Mac','Ramos','mac.ramos.it@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00148');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1A','School of Technology','CCIT',@CCIT,@IT1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M16,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS IT 1B — FEMALE GROUP (Mentor: Evangelista)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Lea','Torres','lea.torres.it@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00149');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1B','School of Technology','CCIT',@CCIT,@IT1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M15,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Lyn','Dela Cruz','lyn.delacruz.it@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00150');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1B','School of Technology','CCIT',@CCIT,@IT1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M15,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Gem','Santos','gem.santos.it@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00151');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1B','School of Technology','CCIT',@CCIT,@IT1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M15,@UID,GETDATE(),1);

-- BS IT 1B — MALE GROUP (Mentor: Salsona)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ken','Bautista','ken.bautista.it@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00152');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1B','School of Technology','CCIT',@CCIT,@IT1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M17,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Vic','Lopez','vic.lopez.it@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00153');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1B','School of Technology','CCIT',@CCIT,@IT1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M17,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ron','Cruz','ron.cruz.it@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00154');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS IT','1st Year','1B','School of Technology','CCIT',@CCIT,@IT1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M17,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS CS 1A — MALE GROUP (Mentor: Manaig)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Jed','Tan','jed.tan.cs@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00155');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CS','1st Year','1A','School of Technology','CCIT',@CCIT,@CS1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M18,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Ivan','Go','ivan.go.cs@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00156');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CS','1st Year','1A','School of Technology','CCIT',@CCIT,@CS1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M18,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Chad','Lim','chad.lim.cs@faith.edu.ph',@Pwd,'Mentee','Male',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00157');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CS','1st Year','1A','School of Technology','CCIT',@CCIT,@CS1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M18,@UID,GETDATE(),1);

-- BS CS 1A — FEMALE GROUP (Mentor: Farafoldane)
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Trish','Dela Cruz','trish.delacruz.cs@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00158');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CS','1st Year','1A','School of Technology','CCIT',@CCIT,@CS1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M19,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Gab','Santos','gab.santos.cs@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00159');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CS','1st Year','1A','School of Technology','CCIT',@CCIT,@CS1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M19,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Kat','Reyes','kat.reyes.cs@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00160');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS CS','1st Year','1A','School of Technology','CCIT',@CCIT,@CS1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M19,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS EMC 1A — FEMALE GROUP (Mentor: Orpilla)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Zoe','Ramos','zoe.ramos.emc@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00161');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EMC','1st Year','1A','School of Technology','CCIT',@CCIT,@EMC1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M20,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Elle','Santos','elle.santos.emc@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00162');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EMC','1st Year','1A','School of Technology','CCIT',@CCIT,@EMC1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M20,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Jade','Cruz','jade.cruz.emc@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00163');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EMC','1st Year','1A','School of Technology','CCIT',@CCIT,@EMC1A);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M20,@UID,GETDATE(),1);

-- ──────────────────────────────────────────────────────────────
-- BS EMC 1B — FEMALE GROUP (Mentor: Galicia)
-- ──────────────────────────────────────────────────────────────
INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Nix','Reyes','nix.reyes.emc@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00164');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EMC','1st Year','1B','School of Technology','CCIT',@CCIT,@EMC1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M21,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Faye','Torres','faye.torres.emc@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00165');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EMC','1st Year','1B','School of Technology','CCIT',@CCIT,@EMC1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M21,@UID,GETDATE(),1);

INSERT INTO Users (FirstName,LastName,Email,PasswordHash,Role,Gender,IsActive,CreatedAt,UpdatedAt,SchoolYear,Semester,StudentNumber)
VALUES ('Gwen','Dela Cruz','gwen.delacruz.emc@faith.edu.ph',@Pwd,'Mentee','Female',1,GETDATE(),GETDATE(),@SY,@SM,'2024-00166');
SET @UID=SCOPE_IDENTITY();
INSERT INTO MenteeProfiles (UserID,Course,YearLevel,Section,School,Department,DepartmentID,SectionID)
VALUES (@UID,'BS EMC','1st Year','1B','School of Technology','CCIT',@CCIT,@EMC1B);
INSERT INTO MentorMentee (MentorID,MenteeID,AssignedDate,IsActive) VALUES (@M21,@UID,GETDATE(),1);

PRINT 'Seed complete: 21 mentors, 66 mentees, all assignments created.';
PRINT 'Default password for all accounts: Faith@2026';
GO
