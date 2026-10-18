using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class SessionsAdminService
    {
        private readonly string _connectionString;
        private static async Task ApplyCourseScopesAsync(SqlConnection conn,List<SessionRowDto> sessions)
        {
            if(sessions.Count==0)return;
            var scopes=(await conn.QueryAsync<(int SessionID,string School,string CourseCode,string Origin)>("SELECT SessionID,School,CourseCode,Origin FROM SessionCourseScopes WHERE SessionID IN @Ids",new {Ids=sessions.Select(s=>s.SessionID).ToArray()})).ToLookup(s=>s.SessionID);
            foreach(var session in sessions)
            {
                var group=scopes[session.SessionID].ToArray();
                if(group.Length==0)continue;
                session.GroupingMode="Course";
                session.IsMakeup=group[0].Origin=="Makeup";
                if(!session.IsMakeup){session.CourseSchool=group[0].School;session.CourseCode=group[0].CourseCode;session.SectionCode=group[0].CourseCode;}
            }
        }
        private async Task ApplyCourseCountsAsync(SqlConnection conn,List<SessionRowDto> sessions)
        {
            foreach(var session in sessions.Where(s=>s.GroupingMode=="Course"&&!s.IsMakeup))
                session.TotalAttendees=(await GetSessionMenteesAsync(session.SessionID)).Count;
        }
        public const string ProofEligibilitySql = """
            SELECT s.SessionID,
                CAST(CASE WHEN EXISTS (SELECT 1 FROM Attendance a
                    WHERE a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL)
                    THEN 1 ELSE 0 END AS bit) AS HasVerifiedAttendance
            FROM Sessions s WHERE s.SessionID IN @Ids
            """;

        public SessionsAdminService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        private async Task PopulateCancellationTimesAsync(List<SessionRowDto> sessions)
        {
            if (sessions.Count == 0) return;
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<(int SessionID, DateTime? CancelledAt)>(
                "SELECT SessionID, CancelledAt FROM Sessions WHERE SessionID IN @Ids",
                new { Ids = sessions.Select(s => s.SessionID).ToArray() });
            var dates = rows.ToDictionary(r => r.SessionID, r => r.CancelledAt);
            foreach (var session in sessions)
                if (dates.TryGetValue(session.SessionID, out var date) && date.HasValue)
                    session.CancelledAt = DateTime.SpecifyKind(date.Value, DateTimeKind.Utc);
        }

        // ── Overview: one card per mentor ─────────────────────────────────────
        public async Task<List<SessionMentorCardDto>> GetMentorCardsAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return (await conn.QueryAsync<SessionMentorCardDto>("EXEC sp_GetMentorCards")).ToList();
        }

        // ── Sessions list for one mentor ──────────────────────────────────────
        // Wrapped in SqlRetry — transient RDS timeouts seen intermittently here.
        public async Task<SessionsMentorDetailDto> GetMentorSessionsAsync(int mentorId) => await SqlRetry.ExecuteAsync(async () =>
        {
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync(
                "EXEC sp_GetMentorSessions @MentorID", new { MentorID = mentorId });
            var mentor        = await multi.ReadFirstOrDefaultAsync<SessionMentorInfoDto>();
            var sessions      = (await multi.ReadAsync<SessionRowDto>()).ToList();
            var sectionQuotas = (await multi.ReadAsync<SectionQuotaDto>()).ToList();
            multi.Dispose();
            await ApplyCourseScopesAsync(conn,sessions);
            await PopulateCancellationTimesAsync(sessions);

            // Supplement with LogStatus (not returned by stored proc)
            var ids = sessions.Select(s => s.SessionID).Distinct().ToList();
            if (ids.Count > 0)
            {
                var proofEligibility = (await conn.QueryAsync<(int SessionID, bool HasVerifiedAttendance)>(
                    ProofEligibilitySql, new { Ids = ids })).ToDictionary(r => r.SessionID, r => r.HasVerifiedAttendance);
                foreach (var s in sessions)
                    s.HasVerifiedAttendance = proofEligibility.GetValueOrDefault(s.SessionID);
                var statusRows = await conn.QueryAsync<(int SessionID, string? LogStatus)>(
                    "SELECT SessionID, LogStatus FROM Sessions WHERE SessionID IN @Ids",
                    new { Ids = ids });
                var logStatuses = statusRows.ToDictionary(r => r.SessionID, r => r.LogStatus);
                foreach (var s in sessions)
                    if (logStatuses.TryGetValue(s.SessionID, out var ls)) s.LogStatus = ls;

                var expectedCounts = await conn.QueryAsync<(int SessionID, int TotalAttendees)>(@"
                    SELECT s.SessionID, COUNT(DISTINCT mm.MenteeID) AS TotalAttendees
                    FROM Sessions s
                    JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.IsActive=1
                                         AND mm.AssignedDate<=s.SessionDate
                    JOIN MenteeProfiles mep ON mep.UserID=mm.MenteeID
                    LEFT JOIN Sections sec ON sec.SectionID=mep.SectionID
                    WHERE s.SessionID IN @Ids AND s.RequestID IS NULL
                      AND ISNULL(mep.IsDropOut,0)=0
                      AND (s.SectionCode IS NULL OR COALESCE(sec.SectionCode,mep.Section)=s.SectionCode)
                    GROUP BY s.SessionID",
                    new { Ids = ids });
                var expectedBySession = expectedCounts.ToDictionary(r => r.SessionID, r => r.TotalAttendees);
                foreach (var s in sessions.Where(s => !s.IsMakeup))
                    s.TotalAttendees = expectedBySession.GetValueOrDefault(s.SessionID);
            }

            if (mentor != null) mentor.SectionQuotas = sectionQuotas;

            await ApplyCourseCountsAsync(conn,sessions);
            return new SessionsMentorDetailDto { Mentor = mentor, Sessions = sessions };
        });

        // ── Full logsheet for a mentor (all sessions + mentees) ──────────────
        public async Task<LogsheetResponseDto> GetLogsheetAsync(int mentorId, bool submittedOnly = false)
        {
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync(
                "EXEC sp_GetLogsheet @MentorID", new { MentorID = mentorId });
            var mentor = await multi.ReadFirstOrDefaultAsync<SessionMentorInfoDto>();
            var rows   = (await multi.ReadAsync<LogsheetFlatRow>()).ToList();

            var absentIds = rows.Where(r => r.AttendanceID.HasValue && !r.IsPresent)
                .Select(r => r.AttendanceID!.Value).Distinct().ToArray();
            if (absentIds.Length > 0)
            {
                var effectiveAbsences = (await conn.QueryAsync<int>(@"
                    SELECT DISTINCT a.AttendanceID
                    FROM Attendance a
                    JOIN Sessions s ON s.SessionID=a.SessionID
                    JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.MenteeID=a.MenteeID
                                         AND mm.AssignedDate<=s.SessionDate
                    WHERE a.AttendanceID IN @AttendanceIds",
                    new { AttendanceIds = absentIds })).ToHashSet();
                rows = rows.Where(r => !r.AttendanceID.HasValue || r.IsPresent ||
                    effectiveAbsences.Contains(r.AttendanceID.Value)).ToList();
            }

            // Supplement LogStatus/SubmittedAt + Remarks/MentorNotes/AbsenceReason — not returned by sp_GetLogsheet
            var sessionIds = rows.Select(r => r.SessionID).Distinct().ToList();
            var logStatuses = new Dictionary<int, string?>();
            var submittedAts = new Dictionary<int, DateTime?>();
            if (sessionIds.Count > 0)
            {
                var statusRows = await conn.QueryAsync<(int SessionID, string? LogStatus, DateTime? SubmittedAt)>(
                    "SELECT SessionID, LogStatus, SubmittedAt FROM Sessions WHERE SessionID IN @Ids",
                    new { Ids = sessionIds });
                foreach (var sr in statusRows)
                {
                    logStatuses[sr.SessionID] = sr.LogStatus;
                    submittedAts[sr.SessionID] = sr.SubmittedAt;
                }
            }

            var attIds = rows.Where(r => r.AttendanceID.HasValue)
                             .Select(r => r.AttendanceID!.Value).Distinct().ToList();
            if (attIds.Count > 0)
            {
                var attRows = await conn.QueryAsync<(int AttendanceID, string? Remarks, string? MentorNotes, string? AbsenceReason)>(
                    "SELECT AttendanceID, Remarks, MentorNotes, AbsenceReason FROM Attendance WHERE AttendanceID IN @Ids",
                    new { Ids = attIds });
                var attMap = attRows.ToDictionary(r => r.AttendanceID);
                foreach (var row in rows)
                    if (row.AttendanceID.HasValue && attMap.TryGetValue(row.AttendanceID.Value, out var ar))
                    { row.Remarks = ar.Remarks; row.MentorNotes = ar.MentorNotes; row.AbsenceReason = ar.AbsenceReason; }
            }

            var sessionList = rows
                .GroupBy(r => r.SessionID)
                .OrderBy(g => g.First().SessionDate).ThenBy(g => g.Key)
                .Select(g =>
                {
                    var f = g.First();
                    logStatuses.TryGetValue(g.Key, out var ls);
                    submittedAts.TryGetValue(g.Key, out var sa);
                    return new LogsheetSessionDto
                    {
                        SessionID     = g.Key,
                        SlotName      = f.SlotName,
                        IsMakeup      = f.IsMakeup,
                        SessionDate   = f.SessionDate,
                        TimeStart     = f.TimeStart,
                        TimeEnd       = f.TimeEnd,
                        Topic         = f.Topic,
                        SessionStatus = f.SessionStatus,
                        Sections      = f.Sections,
                        SessionSectionCode = f.SessionSectionCode,
                        ProofFilePath = f.ProofFilePath,
                        ProofFileType = f.ProofFileType,
                        LogStatus     = ls,
                        SubmittedAt   = sa,
                        SchoolYear    = f.SchoolYear,
                        Semester      = f.Semester,
                        Mentees       = g.Where(r => r.MenteeID.HasValue)
                                         .Select(r => new LogsheetMenteeDto
                                         {
                                             AttendanceID     = r.AttendanceID ?? 0,
                                             MenteeID         = r.MenteeID!.Value,
                                             MenteeName       = r.MenteeName ?? "—",
                                             SectionCode      = r.SectionCode,
                                             ScannedAt        = r.ScannedAt,
                                             IsPresent        = r.IsPresent,
                                             Remarks          = r.Remarks,
                                             MentorNotes      = r.MentorNotes,
                                             AbsenceReason    = r.AbsenceReason,
                                             SignatureFilePath = r.SignatureFilePath,
                                             IsDropOut        = r.IsDropOut
                                         }).ToList()
                    };
                }).ToList();

            // Booked mentees identify each make-up's section even before the first scan.
            foreach (var session in sessionList.Where(s => s.IsMakeup))
            {
                var booked = await GetMakeupSessionRequesterAsync(session.SessionID);
                foreach (var m in booked.Where(m => !session.Mentees.Any(x => x.MenteeID == m.MenteeID)))
                    session.Mentees.Add(new LogsheetMenteeDto {
                        AttendanceID=m.AttendanceID, MenteeID=m.MenteeID,
                        MenteeName=$"{m.MenteeFirstName} {m.MenteeLastName}".Trim(),
                        SectionCode=m.SectionCode, IsPresent=m.IsPresent ?? false, ScannedAt=m.ScannedAt,
                        Remarks=m.Remarks, MentorNotes=m.MentorNotes, AbsenceReason=m.AbsenceReason,
                        SignatureFilePath=m.SignatureFilePath
                    });
            }

            var checkpointStates = (await conn.QueryAsync<CheckpointLogStateDto>(
                "SELECT * FROM CheckpointLogs WHERE MentorID=@MentorID", new { MentorID=mentorId })).ToList();
            foreach (var session in sessionList)
                session.CheckpointStates = checkpointStates.Where(c => c.SchoolYear == session.SchoolYear
                    && c.Semester == session.Semester && c.SlotName == session.SlotName).ToList();

            await CourseWorkflow.AppendLogsheetsAsync(conn,this,mentorId,sessionList);

            // Admin sees only submitted sessions; mentor sees all
            if (submittedOnly)
                sessionList = sessionList.Where(s => s.LogStatus == "Submitted").ToList();

            return new LogsheetResponseDto { Mentor = mentor, Sessions = sessionList };
        }

        // ── Sessions filtered for a specific mentee (their section only) ────────
        public async Task<SessionsMentorDetailDto> GetSessionsForMenteeAsync(int mentorId, int menteeId)
        {
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync(
                "EXEC sp_GetSessionsForMentee @MentorID, @MenteeID",
                new { MentorID = mentorId, MenteeID = menteeId });
            var mentor   = await multi.ReadFirstOrDefaultAsync<SessionMentorInfoDto>();
            var sessions = (await multi.ReadAsync<SessionRowDto>()).ToList();
            await ApplyCourseScopesAsync(conn,sessions);
            var ownCourse=await conn.QuerySingleOrDefaultAsync<CourseGroup>("SELECT School,Course AS CourseCode FROM MenteeProfiles WHERE UserID=@menteeId",new {menteeId});
            var courseRows=(await conn.QueryAsync<SessionRowDto>("""
                SELECT s.SessionID,s.SessionDate,s.Status AS SessionStatus,s.TimeEnd,s.SlotName,s.Notes AS Topic,
                       s.SchoolYear,s.Semester,c.School AS CourseSchool,c.CourseCode,c.CourseCode AS SectionCode,
                       'Course' AS GroupingMode,CAST(0 AS bit) AS IsMakeup,
                       proof.FilePath AS ProofFilePath,proof.FileType AS ProofFileType
                FROM Sessions s JOIN SessionCourseScopes c ON c.SessionID=s.SessionID AND c.Origin='Regular'
                OUTER APPLY(SELECT TOP (1) FilePath,FileType FROM ProofOfSession p WHERE p.SessionID=s.SessionID ORDER BY p.UploadedAt DESC) proof
                WHERE s.MentorID=@mentorId AND (EXISTS(SELECT 1 FROM Attendance a WHERE a.SessionID=s.SessionID AND a.MenteeID=@menteeId)
                  OR (c.School=@School AND UPPER(REPLACE(c.CourseCode,' ',''))=UPPER(REPLACE(@CourseCode,' ',''))))
                """,new {mentorId,menteeId,School=ownCourse?.School,CourseCode=ownCourse?.CourseCode})).ToList();
            sessions.RemoveAll(s=>s.GroupingMode=="Course"&&!s.IsMakeup);
            sessions.AddRange(courseRows);
            await ApplyCourseCountsAsync(conn,sessions);
            await PopulateCancellationTimesAsync(sessions);
            var ids = sessions.Select(s => s.SessionID).Distinct().ToArray();
            if (ids.Length > 0)
            {
                var eligibility=(await conn.QueryAsync<(int SessionID,bool HasVerifiedAttendance)>(ProofEligibilitySql,new {Ids=ids})).ToDictionary(r=>r.SessionID,r=>r.HasVerifiedAttendance);
                foreach(var session in sessions)session.HasVerifiedAttendance=eligibility.GetValueOrDefault(session.SessionID);
                var presentCounts = await conn.QueryAsync<(int SessionID, int PresentCount)>(@"
                    SELECT SessionID, COUNT(*) AS PresentCount
                    FROM Attendance
                    WHERE SessionID IN @Ids AND IsPresent=1 AND ScannedAt IS NOT NULL
                    GROUP BY SessionID", new { Ids = ids });
                var counts = presentCounts.ToDictionary(r => r.SessionID, r => r.PresentCount);
                foreach (var session in sessions)
                    session.PresentCount = counts.GetValueOrDefault(session.SessionID);
            }
            return new SessionsMentorDetailDto { Mentor = mentor, Sessions = sessions };
        }

        // ── Mentees for one session (logsheet detail) ─────────────────────────
        public async Task<List<SessionMenteeRowDto>> GetSessionMenteesAsync(int sessionId)
        {
            using var conn = new SqlConnection(_connectionString);
            var session = await conn.QuerySingleOrDefaultAsync<(int MentorID, int? RequestID, string? SectionCode, DateTime SessionDate)>(
                "SELECT MentorID, RequestID, SectionCode, SessionDate FROM Sessions WHERE SessionID=@SessionID",
                new { SessionID = sessionId });
            if (session.MentorID == 0) return new List<SessionMenteeRowDto>();

            List<SessionMenteeRowDto> mentees;
            if (session.RequestID.HasValue)
            {
                mentees = (await conn.QueryAsync<SessionMenteeRowDto>(
                    "EXEC sp_GetSessionMentees @SessionID", new { SessionID = sessionId })).ToList();
            }
            else
            {
                mentees = (await conn.QueryAsync<SessionMenteeRowDto>(@"
                    SELECT COALESCE(a.AttendanceID,0) AS AttendanceID,
                           u.UserID AS MenteeID, u.FirstName AS MenteeFirstName,
                           u.LastName AS MenteeLastName, u.StudentNumber,
                           COALESCE(sec.SectionCode,mep.Section,N'-') AS SectionCode,
                           mep.Course,mep.YearLevel,a.IsPresent,a.ScannedAt,
                           mep.School AS CourseSchool,
                           a.AbsenceReason,a.MentorNotes,a.Remarks,
                           ISNULL(mep.IsDropOut,0) AS IsDropOut
                    FROM Sessions s
                    CROSS APPLY (
                        SELECT mm.MenteeID
                        FROM MentorMentee mm
                        WHERE mm.MentorID=s.MentorID AND mm.IsActive=1
                          AND mm.AssignedDate<=s.SessionDate
                        UNION
                        SELECT cm.MenteeID FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID
                        UNION
                        SELECT oldAttendance.MenteeID
                        FROM Attendance oldAttendance
                        WHERE oldAttendance.SessionID=s.SessionID
                    ) roster
                    JOIN Users u ON u.UserID=roster.MenteeID
                    LEFT JOIN MenteeProfiles mep ON mep.UserID=u.UserID
                    LEFT JOIN Sections sec ON sec.SectionID=mep.SectionID
                    LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=u.UserID
                    WHERE s.SessionID=@SessionID AND s.RequestID IS NULL
                      AND (a.AttendanceID IS NOT NULL OR ISNULL(mep.IsDropOut,0)=0)
                      AND (a.AttendanceID IS NOT NULL OR NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) OR (u.IsActive=1 AND u.Role='Mentee'))
                      AND (a.AttendanceID IS NOT NULL
                           OR EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=u.UserID)
                           OR EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=u.UserID)
                           OR EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID AND c.Origin='Regular' AND c.School=mep.School AND UPPER(REPLACE(c.CourseCode,' ',''))=UPPER(REPLACE(mep.Course,' ','')))
                           OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND (s.SectionCode IS NULL OR COALESCE(sec.SectionCode,mep.Section)=s.SectionCode)))
                      AND (a.AttendanceID IS NULL OR a.IsPresent=1
                           OR EXISTS (SELECT 1 FROM MentorMentee historical
                                      WHERE historical.MentorID=s.MentorID
                                        AND historical.MenteeID=a.MenteeID
                                        AND historical.AssignedDate<=s.SessionDate))
                    ORDER BY u.LastName,u.FirstName",
                    new { SessionID = sessionId })).ToList();
            }

            // Supplement Remarks/MentorNotes/AbsenceReason — not returned by the stored proc
            if (mentees.Count > 0)
            {
                var attIds = mentees.Select(m => m.AttendanceID).ToList();
                var rows   = await conn.QueryAsync<(int AttendanceID, string? Remarks, string? MentorNotes, string? AbsenceReason)>(
                    "SELECT AttendanceID, Remarks, MentorNotes, AbsenceReason FROM Attendance WHERE AttendanceID IN @Ids",
                    new { Ids = attIds });
                var map = rows.ToDictionary(r => r.AttendanceID);
                foreach (var m in mentees)
                    if (map.TryGetValue(m.AttendanceID, out var r))
                    { m.Remarks = r.Remarks; m.MentorNotes = r.MentorNotes; m.AbsenceReason = r.AbsenceReason; }
            }

            // Supplement SignatureFilePath from MenteeProfiles
            var mIds = mentees.Select(m => m.MenteeID).Distinct().ToList();
            if (mIds.Count > 0)
            {
                var sigRows = await conn.QueryAsync<(int UserID, string? SignatureFilePath)>(
                    "SELECT UserID, SignatureFilePath FROM MenteeProfiles WHERE UserID IN @Ids",
                    new { Ids = mIds });
                var sigMap = sigRows.ToDictionary(r => r.UserID, r => r.SignatureFilePath);
                foreach (var m in mentees)
                    if (sigMap.TryGetValue(m.MenteeID, out var sig))
                        m.SignatureFilePath = sig;
            }

            return mentees;
        }

        // ── Makeup session approved requesters — uses stored proc (SessionRequests-based) so mentees
        // appear even before any QR scan, then supplements with actual Attendance data where it exists.
        // Falls back to querying Attendance directly when the stored proc returns 0 rows (e.g. when
        // the SessionRequests chain is broken or AvailabilityID is null for that request).
        public async Task<List<SessionMenteeRowDto>> GetMakeupSessionRequesterAsync(int sessionId)
        {
            using var conn = new SqlConnection(_connectionString);
            var mentees = (await conn.QueryAsync<SessionMenteeRowDto>(
                "EXEC sp_GetMakeupSessionRequesters @SessionID", new { SessionID = sessionId })).ToList();

            // Fallback: if the stored proc chain yields nothing, read directly from Attendance.
            // This covers sessions where the mentor has already submitted logsheet data but the
            // SessionRequests linkage cannot be resolved.
            if (mentees.Count == 0)
            {
                return (await conn.QueryAsync<SessionMenteeRowDto>(@"
                    SELECT
                        a.AttendanceID,
                        a.MenteeID,
                        u.FirstName  AS MenteeFirstName,
                        u.LastName   AS MenteeLastName,
                        u.StudentNumber,
                        COALESCE(sec.SectionCode, mep.Section, N'—') AS SectionCode,
                        mep.Course,
                        mep.YearLevel,
                        a.IsPresent,
                        a.ScannedAt,
                        a.AbsenceReason,
                        a.MentorNotes,
                        a.Remarks
                    FROM   dbo.Attendance       a
                    JOIN   dbo.Users            u   ON u.UserID       = a.MenteeID
                    LEFT   JOIN dbo.MenteeProfiles mep ON mep.UserID  = a.MenteeID
                    LEFT   JOIN dbo.Sections    sec ON sec.SectionID  = mep.SectionID
                    WHERE  a.SessionID = @SessionID
                    ORDER  BY u.LastName, u.FirstName",
                    new { SessionID = sessionId })).ToList();
            }

            // Patch in actual Attendance data (AttendanceID, IsPresent, ScannedAt, text fields)
            var menteeIds = mentees.Select(m => m.MenteeID).ToList();
            var attRows = await conn.QueryAsync<(int MenteeID, int AttendanceID, bool? IsPresent, DateTime? ScannedAt, string? Remarks, string? MentorNotes, string? AbsenceReason)>(
                @"SELECT MenteeID, AttendanceID, IsPresent, ScannedAt, Remarks, MentorNotes, AbsenceReason
                  FROM Attendance WHERE SessionID = @SessionID AND MenteeID IN @MenteeIds",
                new { SessionID = sessionId, MenteeIds = menteeIds });
            var attMap = attRows.ToDictionary(r => r.MenteeID);
            foreach (var m in mentees)
                if (attMap.TryGetValue(m.MenteeID, out var ar))
                {
                    m.AttendanceID  = ar.AttendanceID;
                    m.IsPresent     = ar.IsPresent;
                    m.ScannedAt     = ar.ScannedAt;
                    m.Remarks       = ar.Remarks;
                    m.MentorNotes   = ar.MentorNotes;
                    m.AbsenceReason = ar.AbsenceReason;
                }

            // Supplement SignatureFilePath from MenteeProfiles
            var menteeIds2 = mentees.Select(m => m.MenteeID).Distinct().ToList();
            if (menteeIds2.Count > 0)
            {
                var sigRows2 = await conn.QueryAsync<(int UserID, string? SignatureFilePath)>(
                    "SELECT UserID, SignatureFilePath FROM MenteeProfiles WHERE UserID IN @Ids",
                    new { Ids = menteeIds2 });
                var sigMap2 = sigRows2.ToDictionary(r => r.UserID, r => r.SignatureFilePath);
                foreach (var m in mentees)
                    if (sigMap2.TryGetValue(m.MenteeID, out var sig))
                        m.SignatureFilePath = sig;
            }

            return mentees;
        }
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public class SessionMentorCardDto
    {
        public int       MentorID          { get; set; }
        public string    FirstName         { get; set; } = string.Empty;
        public string    LastName          { get; set; } = string.Empty;
        public string?   Department        { get; set; }
        public string?   School            { get; set; }
        public int       TotalSessions     { get; set; }
        public int       CompletedSessions { get; set; }
        public int       SessionsWithNotes { get; set; }
        public DateTime? LastSessionDate   { get; set; }
        public string?   Sections          { get; set; }
        public string?   Courses           { get; set; }
    }

    public class SessionMentorInfoDto
    {
        public int     MentorID            { get; set; }
        public string  FirstName           { get; set; } = string.Empty;
        public string  LastName            { get; set; } = string.Empty;
        public string? Email               { get; set; }
        public string? Department          { get; set; }
        public string? School              { get; set; }
        public string? Sections            { get; set; }
        public string? Courses             { get; set; }
        public int     SessionLimit        { get; set; }
        public int     RegularSessionCount { get; set; }
        public string? SignatureFilePath   { get; set; }
        // Per-section breakdown — the quota is enforced per section, not
        // mentor-wide, so a mentor handling more than one section needs each
        // section's own count against SessionLimit rather than one combined
        // number (which could read "8 of 6" for a two-section mentor).
        public List<SectionQuotaDto> SectionQuotas { get; set; } = new();
    }

    public class SectionQuotaDto
    {
        public string SectionCode          { get; set; } = string.Empty;
        public int    SessionLimit         { get; set; }
        public int    RegularSessionCount  { get; set; }
    }

    public class SessionsMentorDetailDto
    {
        public SessionMentorInfoDto?  Mentor   { get; set; }
        public List<SessionRowDto>    Sessions { get; set; } = new();
    }

    public class SessionRowDto
    {
        public DateTime? CancelledAt { get; set; }
        public int       SessionID        { get; set; }
        // Present the moment a session is created, unlike Sections below
        // (derived from Attendance rows, so empty until someone actually
        // takes attendance — never for an upcoming session). The one
        // reliable source for "what section is this session", instead of
        // regex-parsing a "[SECTION]" prefix out of the free-text Topic.
        public string?   SectionCode      { get; set; }
        // Which fixed mentoring checkpoint (Constants/MentoringSlots.cs) this
        // session was logged for — null for a makeup session or one logged
        // before Phase 2 introduced slots. Replaces the old read-time
        // "Session #N" ordinal (SessionNumber) everywhere it was displayed.
        public string?   SlotName         { get; set; }
        public DateTime? SessionDate      { get; set; }
        public DateTime? TimeEnd          { get; set; }
        public string    SessionStatus    { get; set; } = string.Empty;
        public string?   Topic            { get; set; }
        public bool      IsMakeup         { get; set; }
        public int       TotalAttendees   { get; set; }
        public int       PresentCount     { get; set; }
        public string?   CourseCode { get; set; }
        public string?   CourseSchool { get; set; }
        public string?   GroupingMode { get; set; }
        public bool?     HasVerifiedAttendance { get; set; }
        public int       NotesFilledCount { get; set; }
        public string?   ProofFilePath    { get; set; }
        public string?   ProofFileType    { get; set; }
        public string?   Sections         { get; set; }
        public string?   QRCodeToken      { get; set; }
        public string?   LogStatus        { get; set; }
        // Distinct from SessionDate — when the mentor actually submitted the Logsheet.
        public DateTime? SubmittedAt      { get; set; }
        // sp_GetMentorSessions already selects these — without properties to
        // bind them to, Dapper silently dropped both, so nothing could ever
        // tell a current-semester session apart from a prior one client-side.
        public string?   SchoolYear       { get; set; }
        public string?   Semester         { get; set; }
    }

    public class SessionMenteeRowDto
    {
        public int       AttendanceID      { get; set; }
        public int       MenteeID          { get; set; }
        public string    MenteeFirstName   { get; set; } = string.Empty;
        public string    MenteeLastName    { get; set; } = string.Empty;
        public string?   StudentNumber     { get; set; }
        public string?   SectionCode       { get; set; }
        public string?   Course            { get; set; }
        public string?   CourseSchool      { get; set; }
        public string?   YearLevel         { get; set; }
        public bool?     IsPresent         { get; set; }
        public DateTime? ScannedAt         { get; set; }
        public string?   AbsenceReason     { get; set; }
        public string?   MentorNotes       { get; set; }
        public string?   Remarks           { get; set; }
        public string?   SignatureFilePath  { get; set; }
        // A dropped-out mentee can still legitimately appear here (they
        // attended before dropping out, so their Attendance row stays) --
        // this flag is what lets the roster/remarks UI mark them instead
        // of silently looking like an ordinary, still-active mentee.
        public bool      IsDropOut          { get; set; }
    }

    // ── Logsheet DTOs ─────────────────────────────────────────────────────────

    public class LogsheetResponseDto
    {
        public SessionMentorInfoDto?    Mentor   { get; set; }
        public List<LogsheetSessionDto> Sessions { get; set; } = new();
    }

    public class LogsheetSessionDto
    {
        public List<CheckpointLogStateDto> CheckpointStates { get; set; } = new();
        public int           SessionID     { get; set; }
        public string?       CourseCode { get; set; }
        public string?       CourseSchool { get; set; }
        public string?       GroupingMode { get; set; }
        // Which fixed mentoring checkpoint this session was logged for —
        // null for a makeup session or one logged before Phase 2. Replaces
        // the old read-time "Session #N" ordinal (SessionNumber).
        public string?       SlotName      { get; set; }
        public bool          IsMakeup      { get; set; }
        public DateTime?     SessionDate   { get; set; }
        public TimeSpan?     TimeStart     { get; set; }
        public DateTime?     TimeEnd       { get; set; }
        public string?       Topic         { get; set; }
        public string?       SessionStatus { get; set; }
        public string?       Sections      { get; set; }
        // The session's own real section — distinct from Sections (a
        // display-only fallback), used only to decide numbering eligibility.
        public string?       SessionSectionCode { get; set; }
        public string?       ProofFilePath { get; set; }
        public string?       ProofFileType { get; set; }
        public string?       LogStatus     { get; set; }
        // Distinct from SessionDate above — when the mentor actually submitted the Logsheet.
        public DateTime?     SubmittedAt   { get; set; }
        public string?       SchoolYear    { get; set; }
        public string?       Semester      { get; set; }
        public List<LogsheetMenteeDto> Mentees { get; set; } = new();
    }

    public class CheckpointLogStateDto
    {
        public string SchoolYear { get; set; } = "";
        public string Semester { get; set; } = "";
        public string SlotName { get; set; } = "";
        public string SectionCode { get; set; } = "";
        public string? CourseSchool { get; set; }
        public string LogStatus { get; set; } = "";
        public DateTime? SubmittedAt { get; set; }
        public bool NeedsUpdate { get; set; }
    }

    public class LogsheetMenteeDto
    {
        public int       AttendanceID    { get; set; }
        public int       MenteeID       { get; set; }
        public string    MenteeName     { get; set; } = string.Empty;
        public string?   SectionCode    { get; set; }
        public string?   Course { get; set; }
        public string?   CourseSchool { get; set; }
        public DateTime? ScannedAt      { get; set; }
        public bool      IsPresent      { get; set; }
        public string?   Remarks        { get; set; }
        public string?   MentorNotes    { get; set; }
        public string?   AbsenceReason  { get; set; }
        public string?   SignatureFilePath { get; set; }
        public bool      IsDropOut      { get; set; }
    }

    internal class LogsheetFlatRow
    {
        public int       SessionID     { get; set; }
        public string?   SlotName      { get; set; }
        public DateTime? SessionDate   { get; set; }
        public TimeSpan? TimeStart     { get; set; }
        public DateTime? TimeEnd       { get; set; }
        public string?   Topic         { get; set; }
        public string?   SessionStatus { get; set; }
        public int?      AttendanceID  { get; set; }
        public int?      MenteeID      { get; set; }
        public string?   MenteeName    { get; set; }
        public string?   SectionCode   { get; set; }
        public DateTime? ScannedAt     { get; set; }
        public bool      IsPresent     { get; set; }
        public string?   Remarks       { get; set; }
        public string?   MentorNotes   { get; set; }
        public string?   AbsenceReason { get; set; }
        public string?   Sections         { get; set; }
        public bool      IsMakeup         { get; set; }
        public string?   ProofFilePath    { get; set; }
        public string?   ProofFileType    { get; set; }
        public string?   SignatureFilePath { get; set; }
        public string?   SchoolYear       { get; set; }
        public string?   Semester         { get; set; }
        public string?   SessionSectionCode { get; set; }
        public bool      IsDropOut        { get; set; }
    }
}
