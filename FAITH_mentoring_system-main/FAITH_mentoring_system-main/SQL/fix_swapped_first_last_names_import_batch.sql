-- ============================================================
-- fix_swapped_first_last_names_import_batch.sql
--
-- One CSV bulk-import run (UserID 228-260: 15 Mentors across School
-- of Humanities/Management + all 18 newly-imported Mentees) ended up
-- with FirstName and LastName swapped for every row in that batch --
-- confirmed by cross-referencing each account's Email local-part
-- (e.g. "jan.mentor@..." -> given name "Jan") against the stored
-- FirstName/LastName: it matches LastName, not FirstName, for every
-- row in this batch. The earlier batch of 6 School of Technology
-- mentors (UserID 222-227, added individually via the Add User form,
-- not CSV) is unaffected and left untouched.
--
-- This is a one-time data repair for the rows already written before
-- the CSV was corrected on the user's end -- not a code bug (the
-- import's column-header matching is header-text based, not
-- positional, so it isn't order-dependent); the mismatch was in the
-- source file's own column contents.
--
-- Simple swap, scoped tightly to the exact affected UserIDs so this
-- can never touch an unrelated row now or on a future re-run.
-- ============================================================

SET NOCOUNT ON;

UPDATE Users
SET FirstName = LastName,
    LastName  = FirstName
WHERE UserID BETWEEN 228 AND 260;

DECLARE @Rows INT = @@ROWCOUNT;
PRINT 'Rows swapped: ' + CAST(@Rows AS NVARCHAR(10));
