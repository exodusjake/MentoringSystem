-- ============================================================
-- ASTRA MENTORING SYSTEM — Performance Indexes Migration
-- Run against: AstraMentoring database
-- Safe to re-run: all creates are guarded with IF NOT EXISTS
-- No data or logic is modified — read-only schema additions
-- ============================================================
USE AstraMentoring;
GO

-- ── HELPER: print progress
PRINT 'Creating performance indexes...';
GO

-- ============================================================
-- USERS
-- Role and IsActive are filtered on almost every user query
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Role' AND object_id = OBJECT_ID('dbo.Users'))
    CREATE NONCLUSTERED INDEX IX_Users_Role ON dbo.Users (Role);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_IsActive' AND object_id = OBJECT_ID('dbo.Users'))
    CREATE NONCLUSTERED INDEX IX_Users_IsActive ON dbo.Users (IsActive);
GO

-- Composite: the most common filter pattern is WHERE Role = X AND IsActive = 1
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_Role_IsActive' AND object_id = OBJECT_ID('dbo.Users'))
    CREATE NONCLUSTERED INDEX IX_Users_Role_IsActive ON dbo.Users (Role, IsActive);
GO

-- ============================================================
-- MENTORMENTEE
-- The most JOIN-heavy table in the system — every session,
-- attendance, and assignment query touches it
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MentorID' AND object_id = OBJECT_ID('dbo.MentorMentee'))
    CREATE NONCLUSTERED INDEX IX_MentorMentee_MentorID ON dbo.MentorMentee (MentorID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MenteeID' AND object_id = OBJECT_ID('dbo.MentorMentee'))
    CREATE NONCLUSTERED INDEX IX_MentorMentee_MenteeID ON dbo.MentorMentee (MenteeID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_IsActive' AND object_id = OBJECT_ID('dbo.MentorMentee'))
    CREATE NONCLUSTERED INDEX IX_MentorMentee_IsActive ON dbo.MentorMentee (IsActive);
GO

-- Composite: get all active mentees for a mentor in one seek
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MentorID_IsActive' AND object_id = OBJECT_ID('dbo.MentorMentee'))
    CREATE NONCLUSTERED INDEX IX_MentorMentee_MentorID_IsActive
        ON dbo.MentorMentee (MentorID, IsActive)
        INCLUDE (MenteeID, AssignedDate);
GO

-- Composite: check whether a mentee has an active assignment
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorMentee_MenteeID_IsActive' AND object_id = OBJECT_ID('dbo.MentorMentee'))
    CREATE NONCLUSTERED INDEX IX_MentorMentee_MenteeID_IsActive
        ON dbo.MentorMentee (MenteeID, IsActive)
        INCLUDE (MentorID, AssignedDate);
GO

-- ============================================================
-- SESSIONS
-- Filtered by MentorID and Status on every sessions query;
-- sorted and range-filtered on SessionDate
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_MentorID' AND object_id = OBJECT_ID('dbo.Sessions'))
    CREATE NONCLUSTERED INDEX IX_Sessions_MentorID ON dbo.Sessions (MentorID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_Status' AND object_id = OBJECT_ID('dbo.Sessions'))
    CREATE NONCLUSTERED INDEX IX_Sessions_Status ON dbo.Sessions (Status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_SessionDate' AND object_id = OBJECT_ID('dbo.Sessions'))
    CREATE NONCLUSTERED INDEX IX_Sessions_SessionDate ON dbo.Sessions (SessionDate DESC);
GO

-- Composite: WHERE MentorID = X AND Status = 'Completed' (used in attendance + stats)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_MentorID_Status' AND object_id = OBJECT_ID('dbo.Sessions'))
    CREATE NONCLUSTERED INDEX IX_Sessions_MentorID_Status
        ON dbo.Sessions (MentorID, Status)
        INCLUDE (SessionID, SessionDate);
GO

-- Composite: date range queries filtered by status (attendance logs)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sessions_Status_SessionDate' AND object_id = OBJECT_ID('dbo.Sessions'))
    CREATE NONCLUSTERED INDEX IX_Sessions_Status_SessionDate
        ON dbo.Sessions (Status, SessionDate DESC)
        INCLUDE (SessionID, MentorID);
GO

-- ============================================================
-- ATTENDANCE
-- Every sessions page and attendance log JOINs this table
-- on SessionID; mentee presence counts filter on IsPresent
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_SessionID' AND object_id = OBJECT_ID('dbo.Attendance'))
    CREATE NONCLUSTERED INDEX IX_Attendance_SessionID ON dbo.Attendance (SessionID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_MenteeID' AND object_id = OBJECT_ID('dbo.Attendance'))
    CREATE NONCLUSTERED INDEX IX_Attendance_MenteeID ON dbo.Attendance (MenteeID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_IsPresent' AND object_id = OBJECT_ID('dbo.Attendance'))
    CREATE NONCLUSTERED INDEX IX_Attendance_IsPresent ON dbo.Attendance (IsPresent);
GO

-- Composite: COUNT(IsPresent) per session — used in every session card
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Attendance_SessionID_IsPresent' AND object_id = OBJECT_ID('dbo.Attendance'))
    CREATE NONCLUSTERED INDEX IX_Attendance_SessionID_IsPresent
        ON dbo.Attendance (SessionID, IsPresent)
        INCLUDE (MenteeID);
GO

-- ============================================================
-- MENTEEPROFILES
-- UserID is the FK JOIN column; SectionID drives section-based
-- filtering; IsDropOut is filtered in stats and user queries
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_UserID' AND object_id = OBJECT_ID('dbo.MenteeProfiles'))
    CREATE NONCLUSTERED INDEX IX_MenteeProfiles_UserID ON dbo.MenteeProfiles (UserID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_SectionID' AND object_id = OBJECT_ID('dbo.MenteeProfiles'))
    CREATE NONCLUSTERED INDEX IX_MenteeProfiles_SectionID ON dbo.MenteeProfiles (SectionID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_IsDropOut' AND object_id = OBJECT_ID('dbo.MenteeProfiles'))
    CREATE NONCLUSTERED INDEX IX_MenteeProfiles_IsDropOut ON dbo.MenteeProfiles (IsDropOut);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MenteeProfiles_School' AND object_id = OBJECT_ID('dbo.MenteeProfiles'))
    CREATE NONCLUSTERED INDEX IX_MenteeProfiles_School ON dbo.MenteeProfiles (School);
GO

-- ============================================================
-- MENTORPROFILES
-- UserID is the FK JOIN column on every mentor lookup
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorProfiles_UserID' AND object_id = OBJECT_ID('dbo.MentorProfiles'))
    CREATE NONCLUSTERED INDEX IX_MentorProfiles_UserID ON dbo.MentorProfiles (UserID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MentorProfiles_DepartmentID' AND object_id = OBJECT_ID('dbo.MentorProfiles'))
    CREATE NONCLUSTERED INDEX IX_MentorProfiles_DepartmentID ON dbo.MentorProfiles (DepartmentID);
GO

-- ============================================================
-- AVAILABILITY
-- MentorID is filtered on slot lookup; AvailableDate is used
-- in range queries (>= today)
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Availability_MentorID' AND object_id = OBJECT_ID('dbo.Availability'))
    CREATE NONCLUSTERED INDEX IX_Availability_MentorID ON dbo.Availability (MentorID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Availability_AvailableDate' AND object_id = OBJECT_ID('dbo.Availability'))
    CREATE NONCLUSTERED INDEX IX_Availability_AvailableDate ON dbo.Availability (AvailableDate);
GO

-- Composite: get a mentor's upcoming slots in one seek
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Availability_MentorID_AvailableDate' AND object_id = OBJECT_ID('dbo.Availability'))
    CREATE NONCLUSTERED INDEX IX_Availability_MentorID_AvailableDate
        ON dbo.Availability (MentorID, AvailableDate)
        INCLUDE (AvailabilityID);
GO

-- ============================================================
-- SESSIONREQUESTS
-- AvailabilityID is the FK JOIN to Availability;
-- Status is filtered to Pending/Approved/Declined;
-- MenteeID is used for duplicate-request checks
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_AvailabilityID' AND object_id = OBJECT_ID('dbo.SessionRequests'))
    CREATE NONCLUSTERED INDEX IX_SessionRequests_AvailabilityID ON dbo.SessionRequests (AvailabilityID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_Status' AND object_id = OBJECT_ID('dbo.SessionRequests'))
    CREATE NONCLUSTERED INDEX IX_SessionRequests_Status ON dbo.SessionRequests (Status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_MenteeID' AND object_id = OBJECT_ID('dbo.SessionRequests'))
    CREATE NONCLUSTERED INDEX IX_SessionRequests_MenteeID ON dbo.SessionRequests (MenteeID);
GO

-- Composite: duplicate-request check (MenteeID + AvailabilityID + Status = 'Pending')
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_SessionRequests_MenteeID_AvailabilityID_Status' AND object_id = OBJECT_ID('dbo.SessionRequests'))
    CREATE NONCLUSTERED INDEX IX_SessionRequests_MenteeID_AvailabilityID_Status
        ON dbo.SessionRequests (MenteeID, AvailabilityID, Status);
GO

-- ============================================================
-- NOTIFICATIONS
-- Every notification fetch filters by RecipientUserID;
-- IsRead drives unread-count badge queries
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notifications_RecipientUserID' AND object_id = OBJECT_ID('dbo.Notifications'))
    CREATE NONCLUSTERED INDEX IX_Notifications_RecipientUserID ON dbo.Notifications (RecipientUserID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Notifications_RecipientUserID_IsRead' AND object_id = OBJECT_ID('dbo.Notifications'))
    CREATE NONCLUSTERED INDEX IX_Notifications_RecipientUserID_IsRead
        ON dbo.Notifications (RecipientUserID, IsRead)
        INCLUDE (CreatedAt);
GO

-- ============================================================
-- ANNOUNCEMENTS
-- Sorted by IsPinned DESC, PostedAt DESC on every list fetch;
-- PostedByUserID is used for author-based filtering
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Announcements_IsPinned_PostedAt' AND object_id = OBJECT_ID('dbo.Announcements'))
    CREATE NONCLUSTERED INDEX IX_Announcements_IsPinned_PostedAt
        ON dbo.Announcements (IsPinned DESC, PostedAt DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Announcements_PostedByUserID' AND object_id = OBJECT_ID('dbo.Announcements'))
    CREATE NONCLUSTERED INDEX IX_Announcements_PostedByUserID ON dbo.Announcements (PostedByUserID);
GO

-- ============================================================
-- ANNOUNCEMENTCOMMENTS
-- AnnouncementID is the FK JOIN; PostedAt drives ORDER BY
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AnnouncementComments_AnnouncementID' AND object_id = OBJECT_ID('dbo.AnnouncementComments'))
    CREATE NONCLUSTERED INDEX IX_AnnouncementComments_AnnouncementID
        ON dbo.AnnouncementComments (AnnouncementID)
        INCLUDE (PostedAt);
GO

-- ============================================================
-- SECTIONS
-- IsActive is filtered on every section load;
-- School narrows section lists by school
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sections_IsActive' AND object_id = OBJECT_ID('dbo.Sections'))
    CREATE NONCLUSTERED INDEX IX_Sections_IsActive ON dbo.Sections (IsActive);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sections_School' AND object_id = OBJECT_ID('dbo.Sections'))
    CREATE NONCLUSTERED INDEX IX_Sections_School ON dbo.Sections (School);
GO

-- Composite: get active sections for a school in one seek
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Sections_School_IsActive' AND object_id = OBJECT_ID('dbo.Sections'))
    CREATE NONCLUSTERED INDEX IX_Sections_School_IsActive
        ON dbo.Sections (School, IsActive)
        INCLUDE (SectionID, SectionCode, Course, YearLevel);
GO

-- ============================================================
-- PROOFSOFSESSION
-- SessionID is the FK JOIN on every proof lookup
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ProofOfSession_SessionID' AND object_id = OBJECT_ID('dbo.ProofOfSession'))
    CREATE NONCLUSTERED INDEX IX_ProofOfSession_SessionID ON dbo.ProofOfSession (SessionID);
GO

-- ============================================================
-- QRTOKENS
-- Token has a UNIQUE constraint (already indexed).
-- ExpiresAt already has IX_QRTokens_ExpiresAt (from creation).
-- SessionID and MenteeID are FK columns needing indexes;
-- IsUsed is filtered when cleaning up expired tokens.
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QRTokens_SessionID' AND object_id = OBJECT_ID('dbo.QRTokens'))
    CREATE NONCLUSTERED INDEX IX_QRTokens_SessionID ON dbo.QRTokens (SessionID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QRTokens_MenteeID' AND object_id = OBJECT_ID('dbo.QRTokens'))
    CREATE NONCLUSTERED INDEX IX_QRTokens_MenteeID ON dbo.QRTokens (MenteeID);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_QRTokens_IsUsed' AND object_id = OBJECT_ID('dbo.QRTokens'))
    CREATE NONCLUSTERED INDEX IX_QRTokens_IsUsed ON dbo.QRTokens (IsUsed);
GO

-- ============================================================
-- CALENDAREVENTS
-- IsPublished is filtered when fetching mentor-visible events
-- ============================================================

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CalendarEvents_IsPublished' AND object_id = OBJECT_ID('dbo.CalendarEvents'))
    CREATE NONCLUSTERED INDEX IX_CalendarEvents_IsPublished ON dbo.CalendarEvents (IsPublished);
GO

-- ============================================================
PRINT 'Done. All performance indexes created (or already existed).';
GO
