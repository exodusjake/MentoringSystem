-- Phase 3: Evaluation Rating (50% of the ranking formula) is entered
-- manually by Admin, per mentor per School Year + Semester, as a plain
-- 0-100% score (not the earlier-considered 1.00-4.00 GPA scale — a direct
-- percentage needs no conversion to sum with Timeliness/Completeness).
-- One row per mentor per period — Admin edits overwrite via upsert, same
-- "current value only" convention as SystemSettings and Sessions.LogStatus.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

CREATE TABLE dbo.EvaluationRatings (
    RatingID          INT IDENTITY PRIMARY KEY,
    MentorID          INT NOT NULL REFERENCES dbo.Users(UserID),
    SchoolYear        NVARCHAR(20) NOT NULL,
    Semester          NVARCHAR(50) NOT NULL,
    RatingPct         DECIMAL(5,2) NOT NULL CHECK (RatingPct BETWEEN 0 AND 100),
    UpdatedAt         DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedByAdminID  INT NULL REFERENCES dbo.Users(UserID)
);
GO

CREATE UNIQUE INDEX UQ_EvaluationRatings_Mentor_Period
    ON dbo.EvaluationRatings (MentorID, SchoolYear, Semester);
GO
