
USE AstraMentoring;
GO

-- ── vw_MenteeDetails ─────────────────────────────────────────
CREATE OR ALTER VIEW dbo.vw_MenteeDetails AS
SELECT
    u.UserID,
    u.FirstName,
    u.LastName,
    u.Email,
    u.StudentNumber,
    u.IsActive,
    mp.School,
    mp.Department,
    mp.DepartmentID,
    mp.Course,
    mp.YearLevel,
    mp.Section,
    mp.SectionID,
    mp.IsDropOut,
    mp.SignatureFilePath,
    COALESCE(s.SectionCode, mp.Section) AS SectionCode
FROM dbo.Users u
INNER JOIN dbo.MenteeProfiles mp ON mp.UserID   = u.UserID
LEFT  JOIN dbo.Sections        s  ON s.SectionID = mp.SectionID;
GO

-- ── vw_MentorDetails ─────────────────────────────────────────
CREATE OR ALTER VIEW dbo.vw_MentorDetails AS
SELECT
    u.UserID,
    u.FirstName,
    u.LastName,
    u.Email,
    u.ContactNumber,
    u.IsActive,
    mp.School,
    mp.Department,
    mp.DepartmentID,
    mp.Bio,
    mp.Expertise,
    mp.SignatureFilePath,
    COALESCE(d.DepartmentName, mp.Department) AS DepartmentName
FROM dbo.Users u
INNER JOIN dbo.MentorProfiles mp ON mp.UserID      = u.UserID
LEFT  JOIN dbo.Departments     d  ON d.DepartmentID = mp.DepartmentID;
GO

PRINT 'Done. vw_MentorDetails and vw_MenteeDetails updated with SignatureFilePath.';
