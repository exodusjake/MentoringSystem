SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

-- Align dashboard assignment counts, attendance activity, and tiers to the
-- same current-semester, active, non-dropout mentee population.
CREATE OR ALTER PROCEDURE dbo.sp_GetUserStats
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @SchoolYear   NVARCHAR(20),
            @Semester     NVARCHAR(50),
            @SessionLimit INT = 6;
    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';
    SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
    WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                             THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;

    -- RS1: scalar counts. Assigned, unassigned, active, and tiers use the
    -- same active-account/non-dropout mentee cohort. Active means attended
    -- at least one completed checkpoint in the current semester.
    SELECT
        (SELECT COUNT(*) FROM dbo.Users WHERE IsActive = 1) AS TotalUsers,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
         WHERE u.IsActive = 1 AND u.Role = 'Mentor') AS TotalMentors,
        (SELECT COUNT(*) FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.IsActive = 1 AND u.Role = 'Mentee') AS TotalMentees,
        (SELECT COUNT(DISTINCT mm.MenteeID)
         FROM dbo.MentorMentee mm
         INNER JOIN dbo.Users u ON u.UserID = mm.MenteeID
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE mm.IsActive = 1 AND u.IsActive = 1 AND u.Role = 'Mentee'
           AND me.IsDropOut = 0) AS Assigned,
        (SELECT COUNT(*)
         FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.Role = 'Mentee' AND u.IsActive = 1 AND me.IsDropOut = 0
           AND NOT EXISTS (
               SELECT 1 FROM dbo.MentorMentee mm
               WHERE mm.MenteeID = u.UserID AND mm.IsActive = 1)) AS Unassigned,
        (SELECT COUNT(*)
         FROM dbo.Users u
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE u.Role = 'Mentee' AND u.IsActive = 1 AND me.IsDropOut = 1) AS DroppedOut,
        (SELECT COUNT(DISTINCT c.MenteeID)
         FROM dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester) c
         INNER JOIN dbo.Users u ON u.UserID = c.MenteeID
         INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
         WHERE c.Attended = 1 AND u.IsActive = 1 AND u.Role = 'Mentee'
           AND me.IsDropOut = 0) AS ActiveMentees,
        (SELECT COUNT(*) FROM dbo.Sessions s
         LEFT JOIN dbo.ProofOfSession pos ON pos.SessionID = s.SessionID
         WHERE s.Status = 'Completed' AND pos.ProofID IS NULL) AS SessionsWithoutProof,
        ISNULL(@SessionLimit, 6) AS RequiredSessions;

    -- RS2: current-period regular completed session counts + section count.
    SELECT u.UserID AS MentorID,
           ISNULL(sc.SessionCount, 0) AS SessionCount,
           ISNULL(sn.SectionCount, 1) AS SectionCount
    FROM dbo.Users u
    INNER JOIN dbo.MentorProfiles mp ON mp.UserID = u.UserID
    LEFT JOIN (
        SELECT MentorID, COUNT(*) AS SessionCount
        FROM dbo.Sessions
        WHERE Status = 'Completed' AND SchoolYear = @SchoolYear
          AND Semester = @Semester AND RequestID IS NULL AND SectionCode IS NOT NULL
        GROUP BY MentorID
    ) sc ON sc.MentorID = u.UserID
    LEFT JOIN (
        SELECT mm.MentorID,
               COUNT(DISTINCT COALESCE(sec.SectionCode, mep.Section)) AS SectionCount
        FROM dbo.MentorMentee mm
        INNER JOIN dbo.MenteeProfiles mep ON mep.UserID = mm.MenteeID
        LEFT JOIN dbo.Sections sec ON sec.SectionID = mep.SectionID
        WHERE mm.IsActive = 1
          AND COALESCE(sec.SectionCode, mep.Section) IS NOT NULL
        GROUP BY mm.MentorID
    ) sn ON sn.MentorID = u.UserID
    WHERE u.IsActive = 1 AND u.Role = 'Mentor';

    -- RS3: one current-semester attendance tier per assigned, active,
    -- non-dropout mentee, using only their own completed checkpoints.
    SELECT
        CASE
            WHEN totalSessions = 0 THEN 'NoSessions'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.80 THEN 'Excellent'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.60 THEN 'OnTrack'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.40 THEN 'Behind'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.20 THEN 'AtRisk'
            ELSE 'Critical'
        END AS StatusTier,
        COUNT(*) AS MenteeCount
    FROM (
        SELECT u.UserID,
               COUNT(c.CheckpointKey) AS totalSessions,
               ISNULL(SUM(c.Attended), 0) AS presentCount
        FROM dbo.Users u
        INNER JOIN dbo.MenteeProfiles mp ON mp.UserID = u.UserID AND mp.IsDropOut = 0
        INNER JOIN dbo.MentorMentee mm ON mm.MenteeID = u.UserID AND mm.IsActive = 1
        LEFT JOIN dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester) c
          ON c.MentorID = mm.MentorID AND c.MenteeID = u.UserID
        WHERE u.IsActive = 1 AND u.Role = 'Mentee'
        GROUP BY u.UserID
    ) ms
    GROUP BY
        CASE
            WHEN totalSessions = 0 THEN 'NoSessions'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.80 THEN 'Excellent'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.60 THEN 'OnTrack'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.40 THEN 'Behind'
            WHEN CAST(presentCount AS FLOAT) / totalSessions >= 0.20 THEN 'AtRisk'
            ELSE 'Critical'
        END;
END;
GO