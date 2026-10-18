-- Run this in SSMS against AstraMentoring database
ALTER TABLE EvaluationLinks
ADD IsPinned BIT NOT NULL DEFAULT 0;
