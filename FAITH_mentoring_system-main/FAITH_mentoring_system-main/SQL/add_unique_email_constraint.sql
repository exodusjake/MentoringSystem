-- Adds a UNIQUE constraint on Users.Email
-- Safe to run: checks for duplicates first and aborts if any are found.
USE AstraMentoring;
GO

-- Step 1: Check for duplicate emails
IF EXISTS (
    SELECT Email
    FROM Users
    GROUP BY Email
    HAVING COUNT(*) > 1
)
BEGIN
    -- Report the duplicates so they can be resolved manually
    SELECT
        Email,
        COUNT(*) AS DuplicateCount,
        STRING_AGG(CAST(UserID AS NVARCHAR), ', ') AS UserIDs
    FROM Users
    GROUP BY Email
    HAVING COUNT(*) > 1
    ORDER BY DuplicateCount DESC;

    RAISERROR('UNIQUE constraint NOT added: duplicate emails found (see results above). Resolve them first.', 16, 1);
END
ELSE
BEGIN
    -- Step 2: No duplicates — safe to add the constraint
    IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = 'UQ_Users_Email' AND object_id = OBJECT_ID('Users')
    )
    BEGIN
        ALTER TABLE Users
        ADD CONSTRAINT UQ_Users_Email UNIQUE (Email);

        PRINT 'SUCCESS: UNIQUE constraint on Users.Email added.';
    END
    ELSE
    BEGIN
        PRINT 'SKIPPED: UNIQUE constraint already exists.';
    END
END
GO
