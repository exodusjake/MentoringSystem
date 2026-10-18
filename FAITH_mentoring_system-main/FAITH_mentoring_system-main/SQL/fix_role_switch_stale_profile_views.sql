
USE AstraMentoring;
GO

-- Switching a user's role (e.g. Mentor -> Mentee) intentionally leaves their
-- old MentorProfiles/MenteeProfiles row in place so their history isn't
-- lost. These views need Users.Role checked directly, or a role-switched
-- user keeps showing up under their old role everywhere Users/mentors-with-
-- dept or Users/mentees-with-dept is used (the "Available Mentors" import
-- reference list, every "Assign Mentor" dropdown, etc.).

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
LEFT  JOIN dbo.Sections        s  ON s.SectionID = mp.SectionID
WHERE u.Role = 'Mentee';
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
LEFT  JOIN dbo.Departments     d  ON d.DepartmentID = mp.DepartmentID
WHERE u.Role = 'Mentor';
GO

PRINT 'Done. vw_MentorDetails and vw_MenteeDetails now hide a user whose role has since switched away.';
