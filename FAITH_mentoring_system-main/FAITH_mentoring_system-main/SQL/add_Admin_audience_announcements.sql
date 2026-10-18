-- Add 'Admin' to the TargetAudience CHECK constraint on Announcements.
-- Required for the HEAD Admin portal which posts announcements visible only to Head & Admin.

ALTER TABLE Announcements DROP CONSTRAINT CK_Announcements_TargetAudience;

ALTER TABLE Announcements ADD CONSTRAINT CK_Announcements_TargetAudience
    CHECK ([TargetAudience] = 'Admin'
        OR [TargetAudience] = 'Both'
        OR [TargetAudience] = 'Mentee'
        OR [TargetAudience] = 'Mentor');
GO
