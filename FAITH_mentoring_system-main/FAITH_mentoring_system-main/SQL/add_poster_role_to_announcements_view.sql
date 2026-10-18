-- vw_AnnouncementsWithPoster: adds PosterRole so the frontend can tell a
-- Head Admin's post apart from a true Admin's post instead of lumping both
-- under one generic "Admin" badge (their real Users.Role was never
-- selected here, even though the join already had it available).

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
    u.LastName  AS PosterLastName,
    u.Role      AS PosterRole
FROM dbo.Announcements a
JOIN dbo.Users u ON u.UserID = a.PostedByUserID;
