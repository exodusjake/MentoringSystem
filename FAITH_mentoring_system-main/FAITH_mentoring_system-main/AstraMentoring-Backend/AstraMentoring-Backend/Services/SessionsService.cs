using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public enum SessionAddResult
    {
        Created,
        DuplicateRegularSession,
        CheckpointWindowUnavailable,
        InvalidRegularSession
    }

    public class SessionsService
    {
        private readonly IGenericRepository<Session> _repo;
        private readonly string _connectionString;

        public SessionsService(IGenericRepository<Session> repo, IConfiguration configuration)
        {
            _repo = repo;
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<Session>> GetAll() => await _repo.GetAllAsync();
        public async Task<Session?> GetById(int id)
        {
            using var conn=new SqlConnection(_connectionString);
            return await conn.QuerySingleOrDefaultAsync<Session>("SELECT s.*,c.CourseCode,c.School AS CourseSchool FROM Sessions s LEFT JOIN SessionCourseScopes c ON c.SessionID=s.SessionID AND c.Origin='Regular' WHERE s.SessionID=@id",new {id});
        }
        public const string AssignedSectionsSql = """
            SELECT DISTINCT COALESCE(sec.SectionCode, mp.Section)
            FROM MentorMentee mm
            JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID
            LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
            WHERE mm.MentorID=@MentorID AND mm.IsActive=1
              AND NULLIF(LTRIM(RTRIM(COALESCE(sec.SectionCode, mp.Section))), '') IS NOT NULL
            """;

        public static string? ResolveRegularSection(IEnumerable<string> assignedSections, string? requestedSection)
        {
            var sections = assignedSections.Where(s => !string.IsNullOrWhiteSpace(s))
                .Select(s => s.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
            // A sole persisted assignment needs no client selection. Ignore a
            // stale roster label or Notes prefix rather than rejecting that mentor.
            if (sections.Length == 1) return sections[0];
            if (string.IsNullOrWhiteSpace(requestedSection))
                return null;
            return sections.FirstOrDefault(s => string.Equals(s, requestedSection.Trim(), StringComparison.OrdinalIgnoreCase));
        }

        public async Task<SessionAddResult> Add(Session data)
        {
            // This entry point is Log Session only. Availability creates its own
            // request-linked sessions through the booking/approval procedures.
            if (data.RequestID.HasValue) return SessionAddResult.InvalidRegularSession;
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var courses=await CoursePolicy.AssignedAsync(conn,data.MentorID,tx);
            var selected=CoursePolicy.Select(courses,data.CourseCode,data.CourseSchool);
            if (selected == null)
            {
                tx.Rollback();
                return SessionAddResult.InvalidRegularSession;
            }
            data.CourseCode=selected.CourseCode;data.CourseSchool=selected.School;
            // Compatibility display field only for NEW records. The explicit
            // scope below is authoritative; historical SectionCode is untouched.
            data.SectionCode=selected.CourseCode;
            if (data.RequestID == null)
            {
                var duplicate = await conn.ExecuteScalarAsync<int>(@"
                    SELECT COUNT(*) FROM Sessions WITH (UPDLOCK, HOLDLOCK)
                    WHERE MentorID = @MentorID
                      AND (EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=Sessions.SessionID AND c.School=@CourseSchool AND c.CourseCode=@CourseCode AND c.Origin='Regular')
                           OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=Sessions.SessionID) AND (SectionCode=@CourseCode OR EXISTS(
                               SELECT 1 FROM MentorMentee mm JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections legacy ON legacy.SectionID=mp.SectionID
                               WHERE mm.MentorID=Sessions.MentorID AND mm.IsActive=1 AND mp.School=@CourseSchool
                                 AND UPPER(REPLACE(mp.Course,' ',''))=UPPER(REPLACE(@CourseCode,' ',''))
                                 AND COALESCE(legacy.SectionCode,mp.Section)=Sessions.SectionCode))))
                      AND SchoolYear = @SchoolYear AND Semester = @Semester
                      AND SlotName = @SlotName AND RequestID IS NULL
                      AND Status <> 'Cancelled'",
                    data, tx);
                if (duplicate > 0)
                {
                    tx.Rollback();
                    return SessionAddResult.DuplicateRegularSession;
                }
            }

            if (!await CheckpointWindowPolicy.CanScheduleAsync(conn, data.SlotName, data.SchoolYear, data.Semester, data.SessionDate, tx))
            {
                tx.Rollback();
                return SessionAddResult.CheckpointWindowUnavailable;
            }

            data.SessionID = await conn.QuerySingleAsync<int>("""
                INSERT Sessions(MentorID,RequestID,QRCodeToken,SessionDate,Status,Notes,SectionCode,SchoolYear,Semester,SlotName)
                OUTPUT INSERTED.SessionID
                VALUES(@MentorID,@RequestID,@QRCodeToken,@SessionDate,'Scheduled',@Notes,@SectionCode,@SchoolYear,@Semester,@SlotName)
                """,data,tx);
            await conn.ExecuteAsync("INSERT SessionCourseScopes(SessionID,School,CourseCode,Origin) VALUES(@SessionID,@CourseSchool,@CourseCode,'Regular')",data,tx);
            await conn.ExecuteAsync("""
                INSERT SessionCourseMembers(SessionID,MenteeID,School,CourseCode)
                SELECT @SessionID,mm.MenteeID,@CourseSchool,@CourseCode FROM MentorMentee mm JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID
                WHERE mm.MentorID=@MentorID AND mm.IsActive=1 AND mm.AssignedDate<=@SessionDate AND ISNULL(mp.IsDropOut,0)=0
                  AND EXISTS(SELECT 1 FROM Users u WHERE u.UserID=mp.UserID AND u.Role='Mentee' AND u.IsActive=1)
                  AND mp.School=@CourseSchool AND UPPER(REPLACE(mp.Course,' ',''))=UPPER(REPLACE(@CourseCode,' ',''))
                """,data,tx);
            tx.Commit();
            return SessionAddResult.Created;
        }
        public async Task<bool> CourseSlotExistsAsync(int mentorId,CourseGroup course,string schoolYear,string semester,string slotName,int? excludeId)
        {
            using var conn=new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int>("""
                SELECT COUNT(*) FROM Sessions s WHERE s.MentorID=@mentorId AND s.SchoolYear=@schoolYear
                AND s.Semester=@semester AND s.SlotName=@slotName AND s.RequestID IS NULL AND s.Status<>'Cancelled'
                AND (@excludeId IS NULL OR s.SessionID<>@excludeId)
                AND (EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID AND c.School=@School AND c.CourseCode=@CourseCode AND c.Origin='Regular')
                  OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND (s.SectionCode=@CourseCode OR EXISTS(
                      SELECT 1 FROM MentorMentee mm JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections legacy ON legacy.SectionID=mp.SectionID
                      WHERE mm.MentorID=s.MentorID AND mm.IsActive=1 AND mp.School=@School
                        AND UPPER(REPLACE(mp.Course,' ',''))=UPPER(REPLACE(@CourseCode,' ',''))
                        AND COALESCE(legacy.SectionCode,mp.Section)=s.SectionCode))))
                """,new {mentorId,schoolYear,semester,slotName,excludeId,course.School,course.CourseCode})>0;
        }
        public async Task<bool> Update(Session data)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx=conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var scope=await conn.QuerySingleOrDefaultAsync<CourseGroup>("SELECT School,CourseCode FROM SessionCourseScopes WITH(UPDLOCK,HOLDLOCK) WHERE SessionID=@SessionID AND Origin='Regular'",data,tx);
            if(scope!=null && (scope.School!=data.CourseSchool||scope.CourseCode!=data.CourseCode))
            {
                if(await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Attendance WITH(UPDLOCK,HOLDLOCK) WHERE SessionID=@SessionID AND IsPresent=1 AND ScannedAt IS NOT NULL",data,tx)>0)return false;
                var selected=CoursePolicy.Select(await CoursePolicy.AssignedAsync(conn,data.MentorID,tx),data.CourseCode,data.CourseSchool);
                if(selected==null)return false;
                if(await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Sessions s JOIN SessionCourseScopes c ON c.SessionID=s.SessionID WHERE s.SessionID<>@SessionID AND s.MentorID=@MentorID AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.SlotName=@SlotName AND s.Status<>'Cancelled' AND c.Origin='Regular' AND c.School=@CourseSchool AND c.CourseCode=@CourseCode",data,tx)>0)return false;
                await conn.ExecuteAsync("DELETE FROM SessionCourseMembers WHERE SessionID=@SessionID; UPDATE SessionCourseScopes SET School=@CourseSchool,CourseCode=@CourseCode WHERE SessionID=@SessionID AND Origin='Regular'; INSERT SessionCourseMembers SELECT @SessionID,mm.MenteeID,@CourseSchool,@CourseCode FROM MentorMentee mm JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID WHERE mm.MentorID=@MentorID AND mm.IsActive=1 AND mm.AssignedDate<=@SessionDate AND ISNULL(mp.IsDropOut,0)=0 AND EXISTS(SELECT 1 FROM Users u WHERE u.UserID=mp.UserID AND u.Role='Mentee' AND u.IsActive=1) AND mp.School=@CourseSchool AND UPPER(REPLACE(mp.Course,' ',''))=UPPER(REPLACE(@CourseCode,' ',''))",data,tx);
            }
            // A concurrent edit/proof save must not overwrite a scan, finish or submission.
            var updated=await conn.ExecuteAsync(@"
                UPDATE Sessions SET SessionDate=@SessionDate,
                    CancelledAt=CASE WHEN @Status='Cancelled' AND Status<>'Cancelled' THEN SYSUTCDATETIME() WHEN @Status<>'Cancelled' THEN NULL ELSE CancelledAt END,
                    Status=CASE WHEN Status='Completed' AND @Status='Scheduled' THEN Status ELSE @Status END,
                    Notes=@Notes, SectionCode=@SectionCode, SlotName=@SlotName
                WHERE SessionID=@SessionID AND MentorID=@MentorID
                  AND NOT (@Status='Cancelled' AND Status<>'Cancelled' AND (Status='Completed'
                    OR EXISTS(SELECT 1 FROM Attendance WHERE SessionID=@SessionID AND IsPresent=1 AND ScannedAt IS NOT NULL)))", data,tx) > 0;
            tx.Commit();return updated;
        }
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);

        public async Task<DateTime?> FinishAsync(int sessionId, int mentorId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction();
            if (!await CheckpointWindowPolicy.CanAttendAsync(conn,sessionId,tx)
                && !await conn.ExecuteScalarAsync<bool>("SELECT CAST(CASE WHEN EXISTS(SELECT 1 FROM Attendance WHERE SessionID=@sessionId AND IsPresent=1 AND ScannedAt IS NOT NULL) THEN 1 ELSE 0 END AS bit)",new {sessionId},tx))
                return null;
            // Session wall times are Philippine time; QR timestamps are UTC.
            // Capture the full date as well, including sessions ending after midnight.
            var endedAt = await conn.QuerySingleOrDefaultAsync<DateTime?>(@"
                UPDATE Sessions SET TimeEnd = COALESCE(TimeEnd,DATEADD(HOUR, 8, SYSUTCDATETIME())), Status = 'Completed'
                OUTPUT INSERTED.TimeEnd
                WHERE SessionID = @SessionID AND MentorID = @MentorID AND Status <> 'Cancelled';
                EXEC sp_RevertCheckpointOnMakeupAttendance @SessionID;",
                new { SessionID = sessionId, MentorID = mentorId }, tx);
            tx.Commit();
            return endedAt;
        }

        public async Task<bool> UpdateCheckpointLogAsync(Session session, string sectionCode, string logStatus,string? courseSchool=null)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var courseScopes=(await conn.QueryAsync<CourseGroup>("SELECT School,CourseCode FROM SessionCourseScopes WHERE SessionID=@SessionID",new {session.SessionID},tx)).ToArray();
            if(courseScopes.Length>0)
            {
                var selected=courseScopes.Where(c=>string.Equals(c.CourseCode,sectionCode,StringComparison.OrdinalIgnoreCase)
                    && (courseSchool==null||string.Equals(c.School,courseSchool,StringComparison.OrdinalIgnoreCase))).ToArray();
                if(selected.Length!=1)return false;
                var course=selected[0];
                if(logStatus=="Submitted" && await conn.ExecuteScalarAsync<int>("""
                    SELECT COUNT(*) FROM Sessions s JOIN SessionCourseScopes c ON c.SessionID=s.SessionID
                    WHERE s.MentorID=@MentorID AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.SlotName=@SlotName
                      AND c.School=@School AND c.CourseCode=@CourseCode AND s.Status<>'Cancelled' AND s.TimeEnd IS NULL
                      AND EXISTS(SELECT 1 FROM Attendance a WHERE a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL)
                    """,new {session.MentorID,session.SchoolYear,session.Semester,session.SlotName,course.School,course.CourseCode},tx)>0)return false;
                await conn.ExecuteAsync("""
                    MERGE CourseCheckpointLogs WITH(HOLDLOCK) AS target
                    USING(SELECT @MentorID MentorID,@SchoolYear SchoolYear,@Semester Semester,@SlotName SlotName,@School School,@CourseCode CourseCode) source
                    ON target.MentorID=source.MentorID AND target.SchoolYear=source.SchoolYear AND target.Semester=source.Semester
                      AND target.SlotName=source.SlotName AND target.School=source.School AND target.CourseCode=source.CourseCode
                    WHEN MATCHED THEN UPDATE SET LogStatus=@logStatus,
                      SubmittedAt=CASE WHEN @logStatus='Submitted' THEN SYSUTCDATETIME() ELSE target.SubmittedAt END,
                      NeedsUpdate=CASE WHEN @logStatus='Submitted' THEN 0 ELSE target.NeedsUpdate END
                    WHEN NOT MATCHED THEN INSERT(MentorID,SchoolYear,Semester,SlotName,School,CourseCode,LogStatus,SubmittedAt,NeedsUpdate)
                      VALUES(@MentorID,@SchoolYear,@Semester,@SlotName,@School,@CourseCode,@logStatus,CASE WHEN @logStatus='Submitted' THEN SYSUTCDATETIME() END,0);
                    """,new {session.MentorID,session.SchoolYear,session.Semester,session.SlotName,course.School,course.CourseCode,logStatus},tx);
                tx.Commit();return true;
            }
            var args = new { session.MentorID, session.SchoolYear, session.Semester, session.SlotName,
                session.SessionID, session.SubmittedAt, SectionCode = sectionCode, LogStatus = logStatus };
            var allowed = await conn.ExecuteScalarAsync<int>(@"
                SELECT COUNT(*) FROM Sessions s WHERE s.SessionID=@SessionID AND
                (s.SectionCode=@SectionCode OR EXISTS (
                    SELECT 1 FROM Attendance a JOIN MenteeProfiles mp ON mp.UserID=a.MenteeID
                    LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
                    WHERE a.SessionID=s.SessionID AND COALESCE(sec.SectionCode,mp.Section)=@SectionCode)
                 OR EXISTS (
                    SELECT 1 FROM SessionRequests seed JOIN SessionRequests sr ON sr.AvailabilityID=seed.AvailabilityID
                    JOIN MenteeProfiles mp ON mp.UserID=sr.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
                    WHERE seed.RequestID=s.RequestID AND sr.Status='Approved' AND COALESCE(sec.SectionCode,mp.Section)=@SectionCode))",
                args, tx);
            if (allowed == 0) return false;
            if (logStatus == "Submitted")
            {
                var unfinished = await conn.ExecuteScalarAsync<int>(@"
                    SELECT COUNT(*) FROM Sessions s JOIN Attendance a ON a.SessionID=s.SessionID
                    JOIN MenteeProfiles mp ON mp.UserID=a.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
                    WHERE s.MentorID=@MentorID AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester
                      AND s.SlotName=@SlotName AND s.Status<>'Cancelled' AND s.TimeEnd IS NULL
                      AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND COALESCE(sec.SectionCode,mp.Section)=@SectionCode",
                    args, tx);
                if (unfinished > 0) return false;
            }
            // A make-up can serve multiple sections; each section submits independently.
            var exists = await conn.ExecuteScalarAsync<int>(@"
                SELECT COUNT(*) FROM CheckpointLogs WITH (UPDLOCK,HOLDLOCK)
                WHERE MentorID=@MentorID AND SchoolYear=@SchoolYear AND Semester=@Semester
                AND SlotName=@SlotName AND SectionCode=@SectionCode", args, tx);
            if (exists == 0)
                await conn.ExecuteAsync(@"INSERT CheckpointLogs
                    (MentorID,SchoolYear,Semester,SlotName,SectionCode,LogStatus,SubmittedAt,NeedsUpdate)
                    VALUES (@MentorID,@SchoolYear,@Semester,@SlotName,@SectionCode,'Draft',@SubmittedAt,
                        CASE WHEN @SubmittedAt IS NULL THEN 0 ELSE 1 END)", args, tx);
            await conn.ExecuteAsync(@"
                UPDATE CheckpointLogs SET LogStatus=@LogStatus,
                    SubmittedAt=CASE WHEN @LogStatus='Submitted' THEN GETDATE() ELSE SubmittedAt END,
                    NeedsUpdate=CASE WHEN @LogStatus='Submitted' THEN 0 ELSE NeedsUpdate END
                WHERE MentorID=@MentorID AND SchoolYear=@SchoolYear AND Semester=@Semester
                    AND SlotName=@SlotName AND SectionCode=@SectionCode;
                UPDATE Sessions SET LogStatus=@LogStatus,
                    SubmittedAt=CASE WHEN @LogStatus='Submitted' THEN GETDATE() ELSE SubmittedAt END
                WHERE MentorID=@MentorID AND SchoolYear=@SchoolYear AND Semester=@Semester
                    AND SlotName=@SlotName AND SectionCode=@SectionCode AND Status<>'Cancelled';", args, tx);
            tx.Commit();
            return true;
        }

        public async Task<bool> UpdateLogStatusAsync(int sessionId, string logStatus)
        {
            using var conn = new SqlConnection(_connectionString);
            // SubmittedAt is stamped to "now" every time LogStatus becomes
            // Submitted (including re-submitting after Draft) — a mentor's
            // most recent submission is what Timeliness should judge, not
            // whichever one happened first. Left untouched going to Draft.
            var sql = logStatus == "Submitted"
                ? "UPDATE Sessions SET LogStatus = @LogStatus, SubmittedAt = GETDATE() WHERE SessionID = @SessionID"
                : "UPDATE Sessions SET LogStatus = @LogStatus WHERE SessionID = @SessionID";
            var rows = await conn.ExecuteAsync(sql, new { SessionID = sessionId, LogStatus = logStatus });
            return rows > 0;
        }

        // Friendly pre-check for regular sessions. Add repeats this check
        // under a serializable transaction so concurrent POSTs cannot race.
        public async Task<bool> SlotExistsAsync(int mentorId, string? sectionCode, string schoolYear, string semester, string slotName, int? excludeId)
        {
            using var conn = new SqlConnection(_connectionString);
            var count = await conn.ExecuteScalarAsync<int>(
                @"SELECT COUNT(*) FROM Sessions
                  WHERE MentorID = @MentorID
                    AND (SectionCode = @SectionCode OR (SectionCode IS NULL AND @SectionCode IS NULL))
                    AND SchoolYear = @SchoolYear AND Semester = @Semester
                    AND SlotName = @SlotName AND RequestID IS NULL
                    AND Status <> 'Cancelled'
                    AND (@ExcludeId IS NULL OR SessionID <> @ExcludeId)",
                new { MentorID = mentorId, SectionCode = sectionCode, SchoolYear = schoolYear, Semester = semester, SlotName = slotName, ExcludeId = excludeId });
            return count > 0;
        }

        public async Task<bool> HasScannedAttendanceAsync(int sessionId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM Attendance WHERE SessionID=@sessionId AND IsPresent=1 AND ScannedAt IS NOT NULL",
                new { sessionId }) > 0;
        }

        public async Task<bool> DeleteCascadeAsync(int sessionId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx = await conn.BeginTransactionAsync();
            try
            {
                var rows = await DeleteSessionWithinTransactionAsync(conn, tx, sessionId);
                await tx.CommitAsync();
                return rows;
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }
        internal static async Task<bool> DeleteSessionWithinTransactionAsync(SqlConnection conn, System.Data.IDbTransaction tx, int sessionId)
        {
                var availabilityId = await conn.QuerySingleOrDefaultAsync<int?>(@"
                    SELECT sr.AvailabilityID FROM Sessions s WITH (UPDLOCK,HOLDLOCK)
                    JOIN SessionRequests sr ON sr.RequestID=s.RequestID WHERE s.SessionID=@id",
                    new { id=sessionId }, tx);
                await conn.ExecuteAsync("EXEC sp_RevertCheckpointOnMakeupAttendance @id", new { id=sessionId }, tx);
                await conn.ExecuteAsync("DELETE FROM QRTokens   WHERE SessionID = @id", new { id = sessionId }, tx);
                await conn.ExecuteAsync("DELETE FROM Attendance  WHERE SessionID = @id", new { id = sessionId }, tx);
                await conn.ExecuteAsync("DELETE FROM ProofOfSession WHERE SessionID = @id", new { id = sessionId }, tx);
                await conn.ExecuteAsync("DELETE FROM SessionCourseMembers WHERE SessionID=@id; DELETE FROM SessionCourseScopes WHERE SessionID=@id",new {id=sessionId},tx);
                var rows = await conn.ExecuteAsync("DELETE FROM Sessions WHERE SessionID = @id", new { id = sessionId }, tx);
                if (availabilityId.HasValue)
                    await conn.ExecuteAsync(@"
                        IF NOT EXISTS (SELECT 1 FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID
                                       WHERE sr.AvailabilityID=@availabilityId)
                        BEGIN
                            DELETE FROM SessionRequests WHERE AvailabilityID=@availabilityId;
                            DELETE FROM Availability WHERE AvailabilityID=@availabilityId;
                        END", new { availabilityId }, tx);
            return rows > 0;
        }
    }
}
