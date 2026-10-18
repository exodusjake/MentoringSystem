using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class AvailabilityWorkflowService
    {
        private const string BookableSlotsSql = """
            SELECT a.AvailabilityID FROM Availability a
            WHERE a.AvailableDate>=CAST(DATEADD(HOUR,8,SYSUTCDATETIME()) AS date)
            AND EXISTS(SELECT 1 FROM CalendarEvents e
                WHERE e.IsPublished=1 AND e.EventType='Session Schedule' AND e.SlotName=a.SlotName
                  AND (e.SlotName<>'Mentoring Assembly' OR e.Semester<>'2nd Semester')
                  AND e.SchoolYear=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear')
                  AND e.Semester=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester')
                  AND CAST(a.AvailableDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                  AND CAST(DATEADD(HOUR,8,SYSUTCDATETIME()) AS date)<=CAST(COALESCE(e.EndDate,e.StartDate) AS date))
            AND EXISTS(SELECT 1 FROM MentorMentee mm WHERE mm.MentorID=a.MentorID AND mm.MenteeID=@MenteeID AND mm.IsActive=1)
            AND NOT EXISTS(SELECT 1 FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID
                WHERE sr.AvailabilityID=a.AvailabilityID AND (s.Status='Cancelled' OR s.TimeEnd IS NOT NULL))
            AND NOT (EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.AvailabilityID=a.AvailabilityID AND sr.Status='Approved')
                AND NOT EXISTS(SELECT 1 FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID WHERE sr.AvailabilityID=a.AvailabilityID))
            """;
        private const string CompletedCheckpointAvailabilitySql = """
            SELECT DISTINCT a.AvailabilityID
            FROM Availability a
            JOIN Sessions s ON s.MentorID = a.MentorID AND s.SlotName = a.SlotName
            JOIN Attendance att ON att.SessionID = s.SessionID
            WHERE a.AvailabilityID IN @AvailabilityIds
              AND s.SchoolYear = (SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear')
              AND s.Semester = (SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester')
              AND s.Status <> 'Cancelled'
              AND att.MenteeID = @MenteeID
              AND att.IsPresent = 1
              AND att.ScannedAt IS NOT NULL
              AND EXISTS (SELECT 1 FROM CalendarEvents e
                  WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                    AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                    AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date)
                        AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                    AND CAST(DATEADD(HOUR,8,att.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date)
                        AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
              AND EXISTS (
                  SELECT 1 FROM MentorMentee mm
                  WHERE mm.MentorID = s.MentorID AND mm.MenteeID = @MenteeID
                    AND mm.IsActive = 1 AND mm.AssignedDate <= s.SessionDate)
            """;
        private const string CompletedCheckpointSql = """
            SELECT CASE WHEN EXISTS (
                SELECT 1
                FROM Availability a
                JOIN Sessions s ON s.MentorID = a.MentorID AND s.SlotName = a.SlotName
                JOIN Attendance att ON att.SessionID = s.SessionID
                WHERE a.AvailabilityID = @AvailabilityID
                  AND s.SchoolYear = (SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear')
                  AND s.Semester = (SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester')
                  AND s.Status <> 'Cancelled'
                  AND att.MenteeID = @MenteeID
                  AND att.IsPresent = 1
                  AND att.ScannedAt IS NOT NULL
              AND EXISTS (SELECT 1 FROM CalendarEvents e
                  WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                    AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                    AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date)
                        AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                    AND CAST(DATEADD(HOUR,8,att.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date)
                        AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
                  AND EXISTS (
                      SELECT 1 FROM MentorMentee mm
                      WHERE mm.MentorID = s.MentorID AND mm.MenteeID = @MenteeID
                        AND mm.IsActive = 1 AND mm.AssignedDate <= s.SessionDate)
            ) THEN 1 ELSE 0 END
            """;
        private readonly string _connectionString;

        public AvailabilityWorkflowService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        // ── Mentor: get own slots with pending AND approved request rows ──────
        // One row per slot normally; one row per Pending/Approved request when multiple mentees requested.
        public async Task<List<MentorSlotDto>> GetMentorSlotsAsync(int mentorId)
        {
            using var conn = new SqlConnection(_connectionString);
            var slots = (await conn.QueryAsync<MentorSlotDto>(
                "EXEC sp_GetMentorSlots @MentorID", new { MentorID = mentorId })).ToList();
            var linked = (await conn.QueryAsync<(int AvailabilityID, int SessionID, string Status)>(@"
                SELECT sr.AvailabilityID,s.SessionID,s.Status FROM Sessions s
                JOIN SessionRequests sr ON sr.RequestID=s.RequestID WHERE s.MentorID=@MentorID",
                new { MentorID=mentorId })).ToLookup(s=>s.AvailabilityID);
            var windows=(await conn.QueryAsync<(string SlotName,DateTime EndDate)>("""
                SELECT SlotName,COALESCE(EndDate,StartDate) AS EndDate FROM CalendarEvents
                WHERE IsPublished=1 AND EventType='Session Schedule'
                  AND SchoolYear=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear')
                  AND Semester=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester')
                """)).ToDictionary(w=>w.SlotName,w=>w.EndDate);
            foreach (var slot in slots)
            {
                var session = linked[slot.AvailabilityID].OrderBy(s=>s.Status=="Cancelled").ThenBy(s=>s.SessionID).FirstOrDefault();
                slot.IsClosed = !windows.TryGetValue(slot.SlotName??"",out var end) || DateTime.UtcNow.AddHours(8).Date>end.Date;
                slot.LinkedSessionID = session.SessionID == 0 ? null : session.SessionID;
                slot.LinkedSessionStatus = session.Status;
            }
            return slots;
        }

        // ── Mentor: post new slot ──────────────────────────────────────────────
        // Availability follows the same checkpoint window as regular sessions.
        public async Task<(bool ok, string error)> AddSlotAsync(int mentorId, DateTime availableDate, TimeSpan startTime, string slotName)
        {
            using var conn = new SqlConnection(_connectionString);

            await conn.OpenAsync();
            using var tx=conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            if (!await CheckpointWindowPolicy.CanScheduleAsync(conn,slotName,null,null,availableDate,tx))
                return (false,CheckpointWindowPolicy.Error);
            var existing = await conn.ExecuteScalarAsync<int>(@"
                SELECT COUNT(*) FROM Availability
                WHERE MentorID = @MentorID AND AvailableDate = @AvailableDate
                  AND StartTime = @StartTime",
                new { MentorID = mentorId, AvailableDate = availableDate, StartTime = startTime },tx);
            if (existing > 0) return (false, "A slot with the same date and time already exists.");

            var rows = await conn.ExecuteAsync(@"
                INSERT INTO Availability (MentorID, AvailableDate, StartTime, EndTime, IsBooked, SlotName)
                VALUES (@MentorID, @AvailableDate, @StartTime, NULL, 0, @SlotName)",
                new { MentorID = mentorId, AvailableDate = availableDate, StartTime = startTime, SlotName = slotName },tx);
            tx.Commit();
            return rows > 0 ? (true, "") : (false, "Failed to post slot.");
        }

        // ── Mentor: delete slot ────────────────────────────────────────────────
        public async Task<(bool ok, string error)> DeleteSlotAsync(int slotId, int mentorId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Availability WITH (UPDLOCK,HOLDLOCK) WHERE AvailabilityID=@slotId AND MentorID=@mentorId",
                new { slotId, mentorId }, tx);
            var linked = await conn.ExecuteScalarAsync<int>(@"
                SELECT COUNT(*) FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID
                WHERE sr.AvailabilityID=@slotId", new { slotId }, tx);
            if (linked > 0) return (false, "This slot has a session. Cancel or delete it from the Sessions page.");
            var result = await conn.QueryFirstOrDefaultAsync<SpResult>(
                "EXEC sp_DeleteAvailabilitySlot @AvailabilityID, @MentorID",
                new { AvailabilityID = slotId, MentorID = mentorId }, tx);
            tx.Commit();
            return result?.Success == 1 ? (true, "") : (false, result?.ErrorMessage ?? "Slot not found.");
        }

        // ── Mentor: approve request → auto-create Session ─────────────────────
        // Multiple mentees can be approved for the same slot — no auto-decline of others.
        public async Task<(bool ok, string error)> ApproveRequestAsync(int requestId, int mentorId)
        {
            using var conn=new SqlConnection(_connectionString);await conn.OpenAsync();
            using var tx=conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var request=await conn.QuerySingleOrDefaultAsync<(int MenteeID,int AvailabilityID,string SlotName,DateTime AvailableDate,string School,string Course)?>(
                "SELECT sr.MenteeID,sr.AvailabilityID,a.SlotName,a.AvailableDate,mp.School,mp.Course FROM SessionRequests sr JOIN Availability a ON a.AvailabilityID=sr.AvailabilityID JOIN MenteeProfiles mp ON mp.UserID=sr.MenteeID WHERE sr.RequestID=@requestId AND a.MentorID=@mentorId AND sr.Status='Pending'",new {requestId,mentorId},tx);
            if(!request.HasValue)return(false,"Request not found or already actioned.");
            var r=request.Value;
            var course=await CoursePolicy.ResolveAsync(conn,r.School,r.Course,tx);
            if(course==null)return(false,CoursePolicy.Error);
            var available=await conn.ExecuteScalarAsync<int>(BookableSlotsSql+" AND a.AvailabilityID=@AvailabilityID",new {r.MenteeID,r.AvailabilityID},tx);
            if(available==0 || !await CheckpointWindowPolicy.CanScheduleAsync(conn,r.SlotName,null,null,r.AvailableDate,tx))return(false,CheckpointWindowPolicy.Error);
            var alreadyCompleted=await conn.ExecuteScalarAsync<int>(CompletedCheckpointSql,new {r.MenteeID,r.AvailabilityID},tx);
            if(alreadyCompleted>0)return(false,"This mentee has already completed attendance for this checkpoint.");
            var existing=await conn.ExecuteScalarAsync<int?>("SELECT TOP (1) s.SessionID FROM Sessions s JOIN SessionRequests seed ON seed.RequestID=s.RequestID WHERE seed.AvailabilityID=@AvailabilityID",new {r.AvailabilityID},tx);
            var result=await conn.QueryFirstOrDefaultAsync<SpResult>("EXEC sp_ApproveSessionRequest @RequestID,@MentorID",new {RequestID=requestId,MentorID=mentorId},tx);
            if(result?.Success!=1)return(false,result?.ErrorMessage??"Request not found or already actioned.");
            var id=await conn.ExecuteScalarAsync<int>("SELECT TOP (1) s.SessionID FROM Sessions s JOIN SessionRequests seed ON seed.RequestID=s.RequestID WHERE seed.AvailabilityID=@AvailabilityID",new {r.AvailabilityID},tx);
            if(existing==null)
                await conn.ExecuteAsync("UPDATE Sessions SET SlotName=@SlotName,TimeEnd=NULL WHERE SessionID=@id",new {r.SlotName,id},tx);
            if(existing==null || await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes WHERE SessionID=@id",new {id},tx)>0)
                await conn.ExecuteAsync("IF NOT EXISTS(SELECT 1 FROM SessionCourseScopes WHERE SessionID=@id AND School=@School AND CourseCode=@CourseCode) INSERT SessionCourseScopes VALUES(@id,@School,@CourseCode,'Makeup'); IF NOT EXISTS(SELECT 1 FROM SessionCourseMembers WHERE SessionID=@id AND MenteeID=@MenteeID) INSERT SessionCourseMembers VALUES(@id,@MenteeID,@School,@CourseCode);",new {id,r.MenteeID,course.School,course.CourseCode},tx);
            tx.Commit();return(true,"");
        }

        public async Task<bool> DeclineRequestAsync(int requestId, int mentorId)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(@"
                UPDATE sr SET sr.Status = 'Declined', sr.RespondedAt = GETDATE()
                FROM SessionRequests sr
                INNER JOIN Availability a ON a.AvailabilityID = sr.AvailabilityID
                WHERE sr.RequestID = @RequestID AND a.MentorID = @MentorID AND sr.Status = 'Pending'",
                new { RequestID = requestId, MentorID = mentorId });
            return rows > 0;
        }

        // ── Mentee: get mentor's open slots ───────────────────────────────────
        // All future slots from the mentee's assigned mentor are shown.
        // AlreadyRequested = true only when this mentee has a PENDING request (can re-request after decline).
        public async Task<List<OpenSlotDto>> GetOpenSlotsForMenteeAsync(int menteeId)
        {
            using var conn = new SqlConnection(_connectionString);
            var slots = (await conn.QueryAsync<OpenSlotDto>(
                "EXEC sp_GetOpenSlotsForMentee @MenteeID", new { MenteeID = menteeId })).ToList();
            var bookable = (await conn.QueryAsync<int>(BookableSlotsSql, new { MenteeID = menteeId })).ToHashSet();
            var availabilityIds = slots.Select(s => s.AvailabilityID).Distinct().ToArray();
            var completed = availabilityIds.Length == 0
                ? new HashSet<int>()
                : (await conn.QueryAsync<int>(CompletedCheckpointAvailabilitySql,
                    new { AvailabilityIds = availabilityIds, MenteeID = menteeId })).ToHashSet();
            return slots.Where(s => bookable.Contains(s.AvailabilityID)).Select(s =>
            {
                s.CheckpointCompleted = completed.Contains(s.AvailabilityID);
                return s;
            }).ToList();
        }

        // ── Mentee: get full request history ──────────────────────────────────
        public async Task<List<RequestHistoryDto>> GetRequestHistoryForMenteeAsync(int menteeId)
        {
            using var conn = new SqlConnection(_connectionString);
            return (await conn.QueryAsync<RequestHistoryDto>(
                "EXEC sp_GetRequestHistoryForMentee @MenteeID", new { MenteeID = menteeId })).ToList();
        }

        // ── Mentee: submit request ─────────────────────────────────────────────
        public async Task<(bool ok, string error)> SubmitRequestAsync(int menteeId, int availabilityId, string? purpose)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx = conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var profile=await conn.QuerySingleOrDefaultAsync<(string School,string Course)>("SELECT School,Course FROM MenteeProfiles WHERE UserID=@menteeId",new {menteeId},tx);
            var course=await CoursePolicy.ResolveAsync(conn,profile.School,profile.Course,tx);
            if(course==null)return (false,CoursePolicy.Error);
            var existingSession=await conn.QuerySingleOrDefaultAsync<int?>("SELECT TOP (1) s.SessionID FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID WHERE sr.AvailabilityID=@availabilityId",new {availabilityId},tx);

            var checkpoint = await conn.QuerySingleOrDefaultAsync<(int MentorID, string? SlotName, string? SchoolYear, string? Semester)?>(@"
                SELECT a.MentorID, a.SlotName,
                       (SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear') AS SchoolYear,
                       (SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester') AS Semester
                FROM Availability a WITH (UPDLOCK, HOLDLOCK)
                WHERE a.AvailabilityID=@AvailabilityID",
                new { AvailabilityID = availabilityId }, tx);
            if (!checkpoint.HasValue)
            {
                tx.Rollback();
                return (false, "This slot is no longer available. Please refresh.");
            }

            await CheckpointAttendanceLock.AcquireAsync(conn, tx, checkpoint.Value.MentorID, menteeId,
                checkpoint.Value.SchoolYear, checkpoint.Value.Semester, checkpoint.Value.SlotName);

            var alreadyCompleted = await conn.ExecuteScalarAsync<int>(CompletedCheckpointSql,
                new { AvailabilityID = availabilityId, MenteeID = menteeId }, tx);
            if (alreadyCompleted > 0)
            {
                tx.Rollback();
                return (false, "You have already completed attendance for this mentoring checkpoint.");
            }

            var available = await conn.QuerySingleOrDefaultAsync<int?>(BookableSlotsSql + " AND a.AvailabilityID=@AvailabilityID",
                new { MenteeID=menteeId, AvailabilityID=availabilityId }, tx);
            if (!available.HasValue)
            {
                tx.Rollback();
                return (false, "This slot is no longer available. Please refresh.");
            }
            var result = await conn.QueryFirstOrDefaultAsync<SpResult>(
                "EXEC sp_SubmitSessionRequest @MenteeID, @AvailabilityID, @Purpose",
                new { MenteeID = menteeId, AvailabilityID = availabilityId, Purpose = purpose }, tx);
            if (result?.Success != 1)
            {
                tx.Rollback();
                return (false, result?.ErrorMessage ?? "Request failed.");
            }
            var sessionId=await conn.QuerySingleAsync<int>("SELECT TOP (1) s.SessionID FROM Sessions s JOIN SessionRequests sr ON sr.RequestID=s.RequestID WHERE sr.AvailabilityID=@availabilityId",new {availabilityId},tx);
            // Only annotate new course-workflow sessions; historical sessions
            // retain their original classification and grouping.
            if(existingSession==null || await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes WHERE SessionID=@sessionId",new {sessionId},tx)>0)
            {
                await conn.ExecuteAsync("""
                    IF NOT EXISTS(SELECT 1 FROM SessionCourseScopes WHERE SessionID=@sessionId AND School=@School AND CourseCode=@CourseCode)
                      INSERT SessionCourseScopes VALUES(@sessionId,@School,@CourseCode,'Makeup');
                    IF NOT EXISTS(SELECT 1 FROM SessionCourseMembers WHERE SessionID=@sessionId AND MenteeID=@menteeId)
                      INSERT SessionCourseMembers VALUES(@sessionId,@menteeId,@School,@CourseCode);
                    """,new {sessionId,menteeId,course.School,course.CourseCode},tx);
            }
            tx.Commit();
            return (true, "");
        }
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public class MentorSlotDto
    {
        public bool IsClosed { get; set; }
        public int? LinkedSessionID { get; set; }
        public string? LinkedSessionStatus { get; set; }
        public int       AvailabilityID  { get; set; }
        public DateTime  AvailableDate   { get; set; }
        public TimeSpan  StartTime       { get; set; }
        public TimeSpan?  EndTime         { get; set; }
        public string?   SlotName        { get; set; }
        public string    SlotStatus      { get; set; } = "Open";
        public bool      IsLate          { get; set; }
        public int?      RequestID       { get; set; }
        public string?   RequestStatus   { get; set; }
        public string?   Purpose         { get; set; }
        public DateTime? RequestedAt     { get; set; }
        public string?   MenteeName      { get; set; }
        public string?   StudentNumber   { get; set; }
        public string?   SectionCode     { get; set; }
        public string?   ApprovedMentees { get; set; }
    }

    public class OpenSlotDto
    {
        public int      AvailabilityID   { get; set; }
        public int      MentorID         { get; set; }
        public string   MentorName       { get; set; } = string.Empty;
        public DateTime AvailableDate    { get; set; }
        public TimeSpan StartTime        { get; set; }
        public TimeSpan? EndTime          { get; set; }
        public string?  SlotName         { get; set; }
        public bool     AlreadyRequested { get; set; }
        public bool     AlreadyApproved  { get; set; }
        public bool      CheckpointCompleted { get; set; }
    }

    public class RequestHistoryDto
    {
        public int       RequestID     { get; set; }
        public string    Status        { get; set; } = string.Empty;
        public string?   Purpose       { get; set; }
        public DateTime  RequestedAt   { get; set; }
        public DateTime? RespondedAt   { get; set; }
        public string    MentorName    { get; set; } = string.Empty;
        public DateTime  AvailableDate { get; set; }
        public TimeSpan  StartTime     { get; set; }
        public TimeSpan?  EndTime       { get; set; }
        public string?   SlotName      { get; set; }
    }

    internal class SpResult
    {
        public int    Success      { get; set; }
        public string ErrorMessage { get; set; } = string.Empty;
    }
}
