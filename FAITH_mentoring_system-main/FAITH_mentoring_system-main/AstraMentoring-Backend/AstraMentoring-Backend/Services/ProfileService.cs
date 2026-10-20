using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class ProfileService
    {
        private readonly IGenericRepository<User> _userRepo;
        private readonly IGenericRepository<MentorProfile> _mentorRepo;
        private readonly IGenericRepository<MenteeProfile> _menteeRepo;
        private readonly string _connectionString;

        public ProfileService(
            IGenericRepository<User> u,
            IGenericRepository<MentorProfile> m,
            IGenericRepository<MenteeProfile> me,
            IConfiguration config)
        {
            _userRepo = u;
            _mentorRepo = m;
            _menteeRepo = me;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        // ── READ ────────────────────────────────────────────────────────────
        public async Task<IEnumerable<User>> GetAllUsers() => await _userRepo.GetAllAsync();
        public async Task<User?> GetUserById(int id) => await _userRepo.GetByIdAsync(id);
        public async Task<IEnumerable<MentorProfile>> GetAllMentors() => await _mentorRepo.GetAllAsync();
        public async Task<IEnumerable<MenteeProfile>> GetAllMentees() => await _menteeRepo.GetAllAsync();

        public async Task<Dictionary<string,string[]>> GetCourseCatalogAsync()
        {
            using var conn=new SqlConnection(_connectionString);
            var result=AstraMentoring_Backend.Constants.SchoolCourses.Catalog.ToDictionary(p=>p.Key,p=>p.Value.ToArray());
            var rows=await conn.QueryAsync<CourseGroup>("SELECT DISTINCT School,Course AS CourseCode FROM Sections WHERE IsActive=1 AND Course IS NOT NULL");
            foreach(var row in rows)
                if(result.ContainsKey(row.School)) result[row.School]=result[row.School].Append(row.CourseCode).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            return result;
        }
        // Used by UsersController.GetById to decide whether a non-Admin/Head,
        // non-self caller gets the target's contact info (email, phone,
        // student number) or just their name — true for an actual assigned
        // mentor<->mentee pair (either direction), false otherwise.
        public async Task<bool> HasActiveMentorMenteeRelationshipAsync(int userIdA, int userIdB)
        {
            using var conn = new SqlConnection(_connectionString);
            var count = await conn.ExecuteScalarAsync<int>(
                @"SELECT COUNT(*) FROM dbo.MentorMentee
                  WHERE IsActive = 1
                    AND ((MentorID = @A AND MenteeID = @B) OR (MentorID = @B AND MenteeID = @A))",
                new { A = userIdA, B = userIdB });
            return count > 0;
        }

        // ── CREATE ──────────────────────────────────────────────────────────
        public async Task<bool> AddUser(User newUser) => await _userRepo.AddAsync(newUser);

        // ── UPDATE ──────────────────────────────────────────────────────────
        public async Task<bool> UpdateUser(int id, User updatedUser)
        {
            updatedUser.UserID = id;
            using var conn = new SqlConnection(_connectionString);
            var existing = await conn.QueryFirstOrDefaultAsync<User>(
                "SELECT * FROM Users WHERE UserID = @Id", new { Id = id });

            if (existing == null) return false;
            if (string.IsNullOrWhiteSpace(updatedUser.PasswordHash))
                updatedUser.PasswordHash = existing.PasswordHash;
            if (string.IsNullOrWhiteSpace(updatedUser.ProfilePicture))
                updatedUser.ProfilePicture = existing.ProfilePicture;
            if (string.IsNullOrWhiteSpace(updatedUser.Gender))
                updatedUser.Gender = existing.Gender;
            updatedUser.SchoolYear   = existing.SchoolYear;
            updatedUser.Semester     = existing.Semester;
            updatedUser.CreatedAt    = existing.CreatedAt;
            updatedUser.HasLoggedIn  = existing.HasLoggedIn;
            // A regular profile edit (User Management's Edit modal, self-service
            // Profile page) never touches Active/Inactive — that's a dedicated
            // action (SetActiveAsync below). Without this, every save would
            // silently reactivate a deactivated account.
            updatedUser.IsActive     = existing.IsActive;
            updatedUser.UpdatedAt    = DateTime.Now;
            // Profile edits must never overwrite signature/setup state. A full-row
            // repository update also races a signature uploaded after this read.
            return await conn.ExecuteAsync(@"
                UPDATE Users SET FirstName=@FirstName, LastName=@LastName,
                    Email=@Email, PasswordHash=@PasswordHash, ProfilePicture=@ProfilePicture,
                    ContactNumber=@ContactNumber, StudentNumber=@StudentNumber,
                    Role=@Role, Gender=@Gender, UpdatedAt=@UpdatedAt
                WHERE UserID=@UserID", updatedUser) > 0;
        }

        public async Task<bool> UpdateMentorProfileAsync(
            int userId, int? departmentId, string school, string bio, string expertise)
        {
            using var conn = new SqlConnection(_connectionString);

            string? deptName = null;
            string? schoolToSave = school;
            if (departmentId.HasValue)
            {
                var dept = await conn.QueryFirstOrDefaultAsync<(string? DepartmentName, string? School)>(
                    "SELECT DepartmentName, School FROM Departments WHERE DepartmentID = @Id",
                    new { Id = departmentId });
                deptName = dept.DepartmentName;
                // A department with no school (e.g. SAS) means the mentor has no school.
                if (deptName != null && string.IsNullOrWhiteSpace(dept.School)) schoolToSave = null;
            }

            await conn.ExecuteAsync(
                @"MERGE MentorProfiles AS target
                  USING (SELECT @UserID AS UserID) AS source ON target.UserID = source.UserID
                  WHEN MATCHED THEN
                    UPDATE SET DepartmentID = @DepartmentID,
                               School       = @School,
                               Department   = @DepartmentName,
                               Bio          = CASE WHEN @Bio = '' THEN target.Bio ELSE @Bio END,
                               Expertise    = CASE WHEN @Expertise = '' THEN target.Expertise ELSE @Expertise END
                  WHEN NOT MATCHED THEN
                    INSERT (UserID, DepartmentID, School, Department, Bio, Expertise)
                    VALUES (@UserID, @DepartmentID, @School, @DepartmentName,
                            NULLIF(@Bio, ''), NULLIF(@Expertise, ''));",
                new
                {
                    UserID = userId,
                    DepartmentID = departmentId,
                    School = schoolToSave,
                    DepartmentName = deptName,
                    Bio = bio,
                    Expertise = expertise
                });
            return true;
        }

        public async Task<bool> UpdateMenteeProfileAsync(
            int userId, int? departmentId, string school,
            string course, string yearLevel, string section, int? sectionId = null)
        {
            using var conn = new SqlConnection(_connectionString);

            string? deptName = null;
            if (departmentId.HasValue)
            {
                deptName = await conn.ExecuteScalarAsync<string>(
                    "SELECT DepartmentName FROM Departments WHERE DepartmentID = @Id",
                    new { Id = departmentId });
            }

            await conn.ExecuteAsync(
                @"MERGE MenteeProfiles AS target
                  USING (SELECT @UserID AS UserID) AS source ON target.UserID = source.UserID
                  WHEN MATCHED THEN
                    UPDATE SET DepartmentID = @DepartmentID,
                               School       = @School,
                               Department   = @DepartmentName,
                               Course       = @Course,
                               YearLevel    = @YearLevel,
                               Section      = @Section,
                               SectionID    = @SectionID
                  WHEN NOT MATCHED THEN
                    INSERT (UserID, DepartmentID, School, Department, Course, YearLevel, Section, SectionID)
                    VALUES (@UserID, @DepartmentID, @School, @DepartmentName,
                            @Course, @YearLevel, @Section, @SectionID);",
                new
                {
                    UserID         = userId,
                    DepartmentID   = departmentId,
                    School         = school,
                    DepartmentName = deptName,
                    Course         = course,
                    YearLevel      = yearLevel,
                    Section        = section,
                    SectionID      = sectionId
                });
            return true;
        }

        // ── DELETE ──────────────────────────────────────────────────────────
        // sp_DeleteUser is a genuine cascade hard-delete. That's safe for an
        // account whose records only ever involve THEMSELVES (a Mentee's own
        // comments/submissions/attendance) — but a Mentor's Sessions carry
        // OTHER mentees' Attendance (no cascade there, so deleting one today
        // just fails with an FK-violation 500 the moment they have any real
        // session history), and an Admin/Head's Announcements already
        // CASCADE-delete every OTHER user's comments on them. Either way,
        // permanently deleting the poster would destroy records that aren't
        // theirs. Returns null when safe to hard-delete, or a message
        // explaining why not (the caller should show this and point at
        // Drop Out / Deactivate instead).
        public async Task<string?> GetHardDeleteBlockReasonAsync(int id)
        {
            using var conn = new SqlConnection(_connectionString);
            var role = await conn.ExecuteScalarAsync<string?>(
                "SELECT Role FROM Users WHERE UserID = @UserID", new { UserID = id });
            if (role == null) return null; // already gone / not found — let the delete attempt surface that

            if (role == "Mentor")
            {
                var activeMentees = await conn.ExecuteScalarAsync<int>(
                    "SELECT COUNT(DISTINCT MenteeID) FROM dbo.MentorMentee WHERE MentorID = @UserID AND IsActive = 1",
                    new { UserID = id });
                if (activeMentees > 0)
                    return $"This mentor still has {activeMentees} active mentee assignment{(activeMentees == 1 ? "" : "s")}. Remove or reassign them first, or use Deactivate instead.";

                var sessionCount = await conn.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM Sessions WHERE MentorID = @UserID", new { UserID = id });
                if (sessionCount > 0)
                    return "This mentor has conducted sessions with mentee attendance on record — permanently deleting them would also affect those mentees' records. Use Deactivate instead.";
            }
            else if (role == "Admin" || role == "Head")
            {
                if (role == "Admin")
                {
                    // Never leave the system without an active administrator.
                    var otherActiveAdmins = await conn.ExecuteScalarAsync<int>(
                        "SELECT COUNT(*) FROM Users WHERE Role = 'Admin' AND IsActive = 1 AND UserID <> @UserID",
                        new { UserID = id });
                    var targetActive = await conn.ExecuteScalarAsync<bool>(
                        "SELECT CAST(ISNULL(IsActive, 1) AS bit) FROM Users WHERE UserID = @UserID", new { UserID = id });
                    if (targetActive && otherActiveAdmins == 0)
                        return "This is the only active administrator account. Deleting it would leave the system with no admin. Create or activate another admin first.";
                }
                var postCount = await conn.ExecuteScalarAsync<int>(
                    @"SELECT (SELECT COUNT(*) FROM Announcements WHERE PostedByUserID = @UserID)
                           + (SELECT COUNT(*) FROM EvaluationLinks WHERE PostedByUserID = @UserID)",
                    new { UserID = id });
                if (postCount > 0)
                    return "This account has posted announcements or evaluation links that other users have commented on or submitted against — permanently deleting it would also erase those. Use Deactivate instead.";
            }
            else if (role == "Mentee")
            {
                var isDropOut = await conn.ExecuteScalarAsync<bool>(
                    "SELECT CAST(ISNULL(IsDropOut, 0) AS bit) FROM MenteeProfiles WHERE UserID = @UserID", new { UserID = id });
                if (isDropOut)
                    return "This student is marked as Drop Out. Their attendance and assignment history are kept for reporting, so a dropped-out student can't be permanently deleted. Reinstate the student first if this account really has to be erased.";

                var activeAssignments = await conn.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM dbo.MentorMentee WHERE MenteeID = @UserID AND IsActive = 1", new { UserID = id });
                if (activeAssignments > 0)
                    return "This student is currently assigned to a mentor. Remove the assignment first (Assignments tab), or mark them as Drop Out instead.";

                // A makeup session a mentee requested is only safe to fully
                // delete along with them (see sp_DeleteUser) when they were
                // its only real participant. Approved makeup slots can be
                // shared ("multiple mentees approved for the same slot" —
                // sp_ApproveSessionRequest), so if anyone else's approved
                // request or attendance is tied to that same session,
                // deleting it out from under them would erase records that
                // aren't this mentee's to erase.
                var sharedMakeupCount = await conn.ExecuteScalarAsync<int>(
                    @"SELECT COUNT(*) FROM (
                          SELECT s.SessionID
                          FROM   dbo.Sessions s
                          JOIN   dbo.SessionRequests sr ON sr.RequestID = s.RequestID
                          WHERE  sr.MenteeID = @UserID
                      ) mine
                      WHERE EXISTS (
                          SELECT 1 FROM dbo.SessionRequests sr2
                          JOIN   dbo.Sessions s2 ON s2.RequestID = sr2.RequestID
                          WHERE  s2.SessionID = mine.SessionID AND sr2.MenteeID <> @UserID AND sr2.Status = 'Approved'
                      ) OR EXISTS (
                          SELECT 1 FROM dbo.Attendance a WHERE a.SessionID = mine.SessionID AND a.MenteeID <> @UserID
                      ) OR EXISTS (
                          SELECT 1 FROM dbo.SessionCourseMembers cm
                          WHERE cm.SessionID = mine.SessionID AND cm.MenteeID <> @UserID
                      );",
                    new { UserID = id });
                if (sharedMakeupCount > 0)
                    return "This mentee shares a makeup session with other mentees on record — permanently deleting them would also affect those mentees' records. Use Drop Out instead.";
            }

            return null;
        }

        // Ratings a deleted admin saved stay with the mentor (only the
        // "saved by" link is cleared); a deleted mentor's own ratings go with them.
        public async Task<bool> DeleteUser(int id)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();
            await conn.ExecuteAsync(
                @"UPDATE EvaluationRatings SET UpdatedByAdminID = NULL WHERE UpdatedByAdminID = @UserID;
                  DELETE FROM EvaluationRatings WHERE MentorID = @UserID;",
                new { UserID = id }, tx);
            await conn.ExecuteAsync("EXEC sp_DeleteUser @UserID", new { UserID = id }, tx);
            tx.Commit();
            return true;
        }

        // ── DEPARTMENTS ─────────────────────────────────────────────────────
        public async Task<IEnumerable<Department>> GetDepartmentsAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<Department>(
                "SELECT * FROM Departments WHERE IsActive = 1 ORDER BY School, DepartmentName");
        }

        // ── ASSIGNMENTS ─────────────────────────────────────────────────────
        public async Task<MenteeProfile?> GetMenteeProfileAsync(int userId)
        {
            using var conn=new SqlConnection(_connectionString);
            return await conn.QuerySingleOrDefaultAsync<MenteeProfile>("SELECT * FROM MenteeProfiles WHERE UserID=@userId",new {userId});
        }

        public async Task<CourseGroup?> ResolveCourseAsync(string? school,string? course)
        {
            using var conn=new SqlConnection(_connectionString);
            return await CoursePolicy.ResolveAsync(conn,school,course);
        }
        public async Task<int> ResolveSectionIdAsync(CourseGroup course)
        {
            using var conn=new SqlConnection(_connectionString);
            return await CoursePolicy.SectionIdAsync(conn,course);
        }
        public async Task<IEnumerable<AssignmentDto>> GetAssignmentsAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<AssignmentDto>(
                "SELECT * FROM vw_AssignmentDetails WHERE IsActive = 1 ORDER BY AssignedDate DESC, AssignmentID DESC");
        }

        // ── MANUAL ASSIGN ───────────────────────────────────────────────────
        public async Task<bool> AssignMentorAsync(int menteeUserId, int mentorUserId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx=conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var profile=await conn.QuerySingleOrDefaultAsync<MenteeProfile>("SELECT * FROM MenteeProfiles WITH (UPDLOCK,HOLDLOCK) WHERE UserID=@menteeUserId",new {menteeUserId},tx);
            if(profile==null || await CoursePolicy.ResolveAsync(conn,profile.School,profile.Course,tx)==null)
                return false;
            var roles=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Users WHERE IsActive=1 AND ((UserID=@menteeUserId AND Role='Mentee') OR (UserID=@mentorUserId AND Role='Mentor'))",new {menteeUserId,mentorUserId},tx);
            if(roles!=2)return false;
            if(await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM MentorMentee WITH(UPDLOCK,HOLDLOCK) WHERE MentorID=@mentorUserId AND MenteeID=@menteeUserId AND IsActive=1",new {mentorUserId,menteeUserId},tx)>0)
            {
                tx.Commit();return true; // Preserve the original assignment date.
            }
            await conn.ExecuteAsync(
                "EXEC sp_AssignMentor @MenteeID, @MentorID",
                new { MenteeID = menteeUserId, MentorID = mentorUserId },tx);
            tx.Commit();
            return true;
        }

        // ── REMOVE ASSIGNMENT ────────────────────────────────────────────────
        public async Task<bool> RemoveAssignmentAsync(int assignmentId)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE MentorMentee SET IsActive = 0 WHERE AssignmentID = @Id",
                new { Id = assignmentId });
            return rows > 0;
        }

        // ── MENTORS WITH SCHOOL ──────────────────────────────────────────────
        public async Task<IEnumerable<MentorWithDeptDto>> GetMentorsWithDeptAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<MentorWithDeptDto>(
                "SELECT * FROM vw_MentorDetails ORDER BY School, FirstName");
        }

        // ── MENTEES WITH SCHOOL ──────────────────────────────────────────────
        public async Task<IEnumerable<MenteeWithDeptDto>> GetMenteesWithDeptAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<MenteeWithDeptDto>(
                "SELECT * FROM vw_MenteeDetails WHERE IsActive = 1 ORDER BY FirstName");
        }

        // ── COMPLETE FIRST-LOGIN SETUP ───────────────────────────────────────
        public async Task<bool> CompleteSetupAsync(int userId, string? newPassword)
        {
            using var conn = new SqlConnection(_connectionString);
            var user = await conn.QueryFirstOrDefaultAsync<User>(
                "SELECT * FROM Users WHERE UserID = @Id AND HasLoggedIn = 0", new { Id = userId });
            if (user == null || user.HasLoggedIn) return false;

            if (!string.IsNullOrWhiteSpace(newPassword))
            {
                var hash = BCrypt.Net.BCrypt.HashPassword(newPassword);
                var changed = await conn.ExecuteAsync(
                    "UPDATE Users SET PasswordHash = @Hash, HasLoggedIn = 1, UpdatedAt = @Now WHERE UserID = @Id AND HasLoggedIn = 0",
                    new { Hash = hash, Now = DateTime.Now, Id = userId });
                return changed > 0;
            }
            else
            {
                var changed = await conn.ExecuteAsync(
                    "UPDATE Users SET HasLoggedIn = 1, UpdatedAt = @Now WHERE UserID = @Id AND HasLoggedIn = 0",
                    new { Now = DateTime.Now, Id = userId });
                return changed > 0;
            }
        }

        // ── SET DROP-OUT STATUS ──────────────────────────────────────────────
        public async Task<bool> SetDropOutAsync(int userId, bool isDropOut)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE MenteeProfiles SET IsDropOut = @IsDropOut WHERE UserID = @UserID",
                new { IsDropOut = isDropOut, UserID = userId });
            return rows > 0;
        }

        // ── SET ACCOUNT ACTIVE/INACTIVE ───────────────────────────────────────
        // Deactivating blocks login (enforced in AuthService.LoginAsync) without
        // deleting the account or its history — the reversible alternative to
        // the hard DELETE endpoint below.
        public async Task<bool> SetActiveAsync(int userId, bool isActive)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE Users SET IsActive = @IsActive, UpdatedAt = @Now WHERE UserID = @UserID",
                new { IsActive = isActive, Now = DateTime.Now, UserID = userId });
            return rows > 0;
        }

        // ── STATS ────────────────────────────────────────────────────────────
        // Wrapped in SqlRetry — transient RDS timeouts seen intermittently here.
        public async Task<UserStatsDto> GetUserStatsAsync(CancellationToken cancellationToken = default) => await SqlRetry.ExecuteAsync(async () =>
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var conn   = new SqlConnection(_connectionString);
            using var multi  = await conn.QueryMultipleAsync(new CommandDefinition("EXEC sp_GetUserStats", cancellationToken: cancellationToken));

            var counts           = await multi.ReadFirstAsync<StatsCounts>();
            var mentorSessions   = (await multi.ReadAsync<MentorSessionCount>()).ToList();
            var menteeStatusRows = await multi.ReadAsync<MenteeStatusRow>();

            int baseN = counts.RequiredSessions > 0 ? counts.RequiredSessions : 6;

            // Each mentor's effective required = SessionLimit × their number of sections.
            // A mentor with 2 sections needs 12 total regular sessions to be "Excellent".
            int excellent = 0, onTrack = 0, behind = 0, critical = 0;
            foreach (var m in mentorSessions)
            {
                int n    = baseN * Math.Max(1, m.SectionCount);
                int exLo = (int)Math.Ceiling(n * 0.80);
                int otLo = (int)Math.Ceiling(n * 0.50);
                int bhLo = (int)Math.Ceiling(n * 0.25);
                if      (m.SessionCount >= exLo) excellent++;
                else if (m.SessionCount >= otLo) onTrack++;
                else if (m.SessionCount >= bhLo) behind++;
                else                             critical++;
            }

            return new UserStatsDto
            {
                TotalUsers               = counts.TotalUsers,
                TotalMentors             = counts.TotalMentors,
                TotalMentees             = counts.TotalMentees,
                Assigned                 = counts.Assigned,
                Unassigned               = counts.Unassigned,
                DroppedOut               = counts.DroppedOut,
                ActiveMentees            = counts.ActiveMentees,
                SessionsWithoutProof     = counts.SessionsWithoutProof,
                RequiredSessions         = counts.RequiredSessions,
                MentorsBehind            = critical + behind,
                CriticalMentors          = critical,
                SessionDistribution      = new Dictionary<string, int>
                {
                    ["Critical"] = critical,
                    ["Behind"]   = behind,
                    ["OnTrack"]  = onTrack,
                    ["Excellent"] = excellent
                },
                MenteeStatusDistribution = menteeStatusRows.ToDictionary(r => r.StatusTier, r => r.MenteeCount)
            };
        }, cancellationToken, retryTimeouts: false);

        public async Task<IReadOnlyList<MenteeEngagementResponse>> GetMenteeEngagementAsync(CancellationToken cancellationToken)
        {
            const string sql = """
                DECLARE @SchoolYear NVARCHAR(20) =
                    (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear');
                DECLARE @Semester NVARCHAR(50) =
                    (SELECT SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester');

                ;WITH AttendanceCounts AS (
                    SELECT MenteeID, COUNT(*) AS CompletedCheckpoints,
                           SUM(Attended) AS SessionsAttended
                    FROM dbo.fn_MenteeCheckpointAttendance(@SchoolYear, @Semester)
                    GROUP BY MenteeID
                ), CurrentAssignments AS (
                    SELECT DISTINCT MenteeID
                    FROM dbo.MentorMentee
                    WHERE IsActive = 1
                )
                SELECT u.UserID AS MenteeID, u.FirstName, u.LastName, u.StudentNumber,
                       me.Course, me.YearLevel, COALESCE(sec.SectionCode, me.Section) AS SectionCode,
                       me.School,
                       CAST(CASE WHEN ca.MenteeID IS NULL THEN 0 ELSE 1 END AS bit) AS IsAssigned,
                       CAST(ISNULL(me.IsDropOut, 0) AS bit) AS IsDropOut,
                       ISNULL(ac.SessionsAttended, 0) AS SessionsAttended,
                       ISNULL(ac.CompletedCheckpoints, 0) AS CompletedCheckpoints,
                       CASE
                           WHEN me.IsDropOut = 1 THEN 'Dropped Out'
                           WHEN ca.MenteeID IS NULL THEN 'Unassigned'
                           WHEN ISNULL(ac.CompletedCheckpoints, 0) = 0 THEN 'No Completed Sessions'
                           WHEN CAST(ISNULL(ac.SessionsAttended, 0) AS FLOAT) / ac.CompletedCheckpoints >= 0.80 THEN 'Excellent'
                           WHEN CAST(ISNULL(ac.SessionsAttended, 0) AS FLOAT) / ac.CompletedCheckpoints >= 0.60 THEN 'On Track'
                           WHEN CAST(ISNULL(ac.SessionsAttended, 0) AS FLOAT) / ac.CompletedCheckpoints >= 0.20 THEN 'Needs Attention'
                           ELSE 'Needs Attention'
                       END AS AttendanceStatus
                FROM dbo.Users u
                INNER JOIN dbo.MenteeProfiles me ON me.UserID = u.UserID
                LEFT JOIN dbo.Sections sec ON sec.SectionID = me.SectionID
                LEFT JOIN CurrentAssignments ca ON ca.MenteeID = u.UserID
                LEFT JOIN AttendanceCounts ac ON ac.MenteeID = u.UserID
                WHERE u.Role = 'Mentee' AND u.IsActive = 1
                ORDER BY me.School, me.Course, SectionCode, u.LastName, u.FirstName;
                """;

            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<MenteeEngagementResponse>(
                new CommandDefinition(sql, cancellationToken: cancellationToken));
            return rows.AsList();
        }

        private class StatsCounts
        {
            public int TotalUsers           { get; set; }
            public int TotalMentors         { get; set; }
            public int TotalMentees         { get; set; }
            public int Assigned             { get; set; }
            public int Unassigned           { get; set; }
            public int DroppedOut           { get; set; }
            public int ActiveMentees        { get; set; }
            public int SessionsWithoutProof { get; set; }
            public int RequiredSessions     { get; set; }
        }

        private class MentorSessionCount
        {
            public int MentorID     { get; set; }
            public int SessionCount { get; set; }
            public int SectionCount { get; set; }
        }

        private class MenteeStatusRow
        {
            public string StatusTier { get; set; } = string.Empty;
            public int    MenteeCount { get; set; }
        }
    }

    /// <summary>Attendance and assignment details for one active mentee on the Admin dashboard.</summary>
    public sealed record MenteeEngagementResponse(
        int MenteeID,
        string FirstName,
        string LastName,
        string? StudentNumber,
        string? Course,
        string? YearLevel,
        string? SectionCode,
        string? School,
        bool IsAssigned,
        bool IsDropOut,
        int SessionsAttended,
        int CompletedCheckpoints,
        string AttendanceStatus);

    public class AssignmentDto
    {
        public int AssignmentID { get; set; }
        public int MenteeUserID { get; set; }
        public int MentorUserID { get; set; }
        public string MenteeName { get; set; } = string.Empty;
        public string MentorName { get; set; } = string.Empty;
        public string? Course { get; set; }
        public string? YearLevel { get; set; }
        public string? MenteeSchool { get; set; }
        public string? DepartmentName { get; set; }
        public string? MentorSchool { get; set; }
        public DateTime AssignedDate { get; set; }
        public bool IsActive { get; set; }
    }

    public class UserStatsDto
    {
        public int TotalUsers { get; set; }
        public int TotalMentors { get; set; }
        public int TotalMentees { get; set; }
        public int Assigned { get; set; }
        public int Unassigned { get; set; }
        public int DroppedOut { get; set; }
        public int ActiveMentees { get; set; }
        public int SessionsWithoutProof { get; set; }
        public int MentorsBehind { get; set; }
        public int CriticalMentors { get; set; }
        public int RequiredSessions { get; set; }
        public Dictionary<string, int> SessionDistribution { get; set; } = new();
        public Dictionary<string, int> MenteeStatusDistribution { get; set; } = new();
    }

    public class MentorWithDeptDto
    {
        public int UserID { get; set; }
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string? School { get; set; }
        public string? DepartmentName { get; set; }
        public int? DepartmentID { get; set; }
        public string? SignatureFilePath { get; set; }
        // vw_MentorDetails already selects this — without it here, Dapper
        // silently drops the column and every mentor (deactivated or not)
        // looks identical to the frontend's "Assign Mentor" filtering.
        public bool IsActive { get; set; }
    }

    public class MenteeWithDeptDto
    {
        public int UserID { get; set; }
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string? School { get; set; }
        public string? Department { get; set; }
        public string? Course { get; set; }
        public string? YearLevel { get; set; }
        public string? Section { get; set; }
        public int? SectionID { get; set; }
        public string? SectionCode { get; set; }
        public bool IsDropOut { get; set; }
        public string? SignatureFilePath { get; set; }
    }
}
