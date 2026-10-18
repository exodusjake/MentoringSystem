-- ============================================================
-- ASTRA MENTORING SYSTEM — Views Migration
-- Run against: AstraMentoring database
-- Safe to re-run: CREATE OR ALTER updates existing views
-- No data or logic is modified
-- ============================================================
USE AstraMentoring;
GO

PRINT 'Creating / updating views...';
GO

-- ============================================================
-- vw_MenteeDetails
-- Resolves SectionCode from the Sections table, exposes IsDropOut.
-- Used by ProfileService.GetMenteesWithDeptAsync()
-- ============================================================
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
    COALESCE(s.SectionCode, mp.Section) AS SectionCode
FROM dbo.Users u
INNER JOIN dbo.MenteeProfiles mp ON mp.UserID   = u.UserID
LEFT  JOIN dbo.Sections        s  ON s.SectionID = mp.SectionID;
GO

-- ============================================================
-- vw_MentorDetails
-- Mentor profile with resolved DepartmentName.
-- Used by ProfileService.GetMentorsWithDeptAsync()
-- ============================================================
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
    COALESCE(d.DepartmentName, mp.Department) AS DepartmentName
FROM dbo.Users u
INNER JOIN dbo.MentorProfiles mp ON mp.UserID      = u.UserID
LEFT  JOIN dbo.Departments     d  ON d.DepartmentID = mp.DepartmentID;
GO

-- ============================================================
-- vw_AssignmentDetails
-- Mentor-mentee assignment join with both party names and profile info.
-- Used by ProfileService.GetAssignmentsAsync()
-- ============================================================
CREATE OR ALTER VIEW dbo.vw_AssignmentDetails AS
SELECT
    mm.AssignmentID,
    mm.MenteeID                                        AS MenteeUserID,
    mm.MentorID                                        AS MentorUserID,
    mu.FirstName  + ' ' + mu.LastName                 AS MenteeName,
    mtu.FirstName + ' ' + mtu.LastName                AS MentorName,
    me.Course,
    me.YearLevel,
    me.School                                          AS MenteeSchool,
    COALESCE(d.DepartmentName, mp.Department)          AS DepartmentName,
    mp.School                                          AS MentorSchool,
    mm.AssignedDate,
    mm.IsActive
FROM dbo.MentorMentee mm
INNER JOIN dbo.Users            mu  ON mu.UserID       = mm.MenteeID
INNER JOIN dbo.Users            mtu ON mtu.UserID      = mm.MentorID
LEFT  JOIN dbo.MenteeProfiles   me  ON me.UserID       = mm.MenteeID
LEFT  JOIN dbo.MentorProfiles   mp  ON mp.UserID       = mm.MentorID
LEFT  JOIN dbo.Departments      d   ON d.DepartmentID  = mp.DepartmentID;
GO

-- ============================================================
-- vw_AnnouncementsWithPoster
-- Announcement join with poster first/last name.
-- Used by AnnouncementsService.GetAllWithPoster()
-- ============================================================
CREATE OR ALTER VIEW dbo.vw_AnnouncementsWithPoster AS
SELECT
    a.AnnouncementID,
    a.PostedByUserID,
    a.Title,
    a.Content,
    a.TargetAudience,
    a.PostedAt,
    a.IsActive,
    a.IsPinned,
    u.FirstName AS PosterFirstName,
    u.LastName  AS PosterLastName
FROM dbo.Announcements a
JOIN dbo.Users u ON u.UserID = a.PostedByUserID;
GO

-- ============================================================
PRINT 'Done. All views created / updated.';
GO
