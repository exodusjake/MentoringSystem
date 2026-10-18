-- add_account_period_history.sql
--
-- User Management's School Year/Semester column had no correct meaning
-- either frozen (stale forever after registration) or live (every account,
-- active or not, shows the same "now" value -- no way to tell who actually
-- had an account during a past period). The real ask: "sino ang may
-- account noong School Year X" -- a per-period MEMBERSHIP record, not a
-- single column on Users.
--
-- This adds a lightweight snapshot table: every time Admin changes
-- System Settings' SchoolYear or Semester to a genuinely different value
-- (see SettingsService.UpdateAsync), every currently-Active account gets
-- one row recorded here tagged with the OUTGOING period (the one about
-- to end) -- a "photo" of who was active right before the period changed.
-- Re-saving the same value (a no-op Save) does not create a duplicate.
--
-- This never touches System Settings itself, and never changes what
-- "current" means for the rest of the system -- it only ever appends
-- history. The "current" period's membership is derived live (whoever
-- is Active right now), same as today; only PAST periods read from here.
--
-- Note: this can only start recording from the moment it's deployed --
-- there is no way to retroactively reconstruct who was active during a
-- period that already ended before this table existed.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'AccountPeriodHistory')
BEGIN
    CREATE TABLE dbo.AccountPeriodHistory (
        HistoryID   INT IDENTITY(1,1) PRIMARY KEY,
        UserID      INT NOT NULL,
        SchoolYear  NVARCHAR(20) NOT NULL,
        Semester    NVARCHAR(50) NOT NULL,
        RecordedAt  DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_AccountPeriodHistory_Users FOREIGN KEY (UserID) REFERENCES dbo.Users(UserID),
        CONSTRAINT UQ_AccountPeriodHistory UNIQUE (UserID, SchoolYear, Semester)
    );
END
