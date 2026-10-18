using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class AttendanceLogsService
    {
        private readonly string _connectionString;

        public AttendanceLogsService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        // ── Overview: summary stats + one card per mentor ─────────────────────
        // Summary totals are derived here from the (current-semester-scoped)
        // mentor list rather than a separate SQL result set — the stored
        // procedure used to also return an unfiltered, all-time summary that
        // no consumer read (every frontend recomputes these same totals from
        // the mentor list anyway) and that quietly disagreed with everything
        // else on the page once more than one semester had data.
        public async Task<AttendanceOverviewDto> GetOverviewAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            var mentors = (await conn.QueryAsync<AttendanceMentorCardDto>("EXEC sp_GetAttendanceOverview")).ToList();
            var period=(await conn.QueryAsync<(string Key,string Value)>("SELECT SettingKey AS [Key],SettingValue AS Value FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')")).ToDictionary(r=>r.Key,r=>r.Value);
            // Totals are the same rows the mentee cards show.
            if(mentors.Count>0)
            {
                var rows=(await conn.QueryAsync<(int MentorID,int MenteeID,string SlotName,int Attended)>(CourseWorkflow.MenteeCheckpointAttendanceSql,new {MentorIds=mentors.Select(m=>m.MentorID).ToArray(),SchoolYear=period.GetValueOrDefault("SchoolYear"),Semester=period.GetValueOrDefault("Semester")})).ToLookup(r=>r.MentorID);
                foreach(var mentor in mentors){mentor.TotalAttendees=rows[mentor.MentorID].Count();mentor.PresentCount=rows[mentor.MentorID].Sum(r=>r.Attended);}
                // Per-section breakdown, so the page can total only the selected school/department/section.
                var ids=mentors.Select(m=>m.MentorID).ToArray();
                var menteeIds=rows.SelectMany(g=>g.Select(r=>r.MenteeID)).Distinct().ToArray();
                var menteeSection=menteeIds.Length==0?new Dictionary<int,string>():(await conn.QueryAsync<(int UserID,string? Code)>("SELECT mp.UserID,COALESCE(sec.SectionCode,mp.Section) FROM MenteeProfiles mp LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID WHERE mp.UserID IN @menteeIds",new {menteeIds})).ToDictionary(r=>r.UserID,r=>r.Code??"");
                var sessions=(await conn.QueryAsync<(int MentorID,string? Code,int Sessions)>("""
                    SELECT s.MentorID,COALESCE(NULLIF(s.SectionCode,''),c.CourseCode) Code,COUNT(DISTINCT s.SessionID) Sessions
                    FROM Sessions s LEFT JOIN SessionCourseScopes c ON c.SessionID=s.SessionID AND NULLIF(s.SectionCode,'') IS NULL
                    WHERE s.MentorID IN @ids AND s.Status='Completed' AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester
                    GROUP BY s.MentorID,COALESCE(NULLIF(s.SectionCode,''),c.CourseCode)
                    """,new {ids,SchoolYear=period.GetValueOrDefault("SchoolYear"),Semester=period.GetValueOrDefault("Semester")})).ToLookup(r=>r.MentorID);
                foreach(var mentor in mentors)
                {
                    var stats=rows[mentor.MentorID].GroupBy(r=>menteeSection.GetValueOrDefault(r.MenteeID,""))
                        .ToDictionary(g=>g.Key,g=>new AttendanceSectionStatDto{SectionCode=g.Key,Records=g.Count(),Present=g.Sum(r=>r.Attended)});
                    foreach(var row in sessions[mentor.MentorID])
                    {
                        var code=row.Code??"";
                        if(!stats.TryGetValue(code,out var stat))stats[code]=stat=new AttendanceSectionStatDto{SectionCode=code};
                        stat.Sessions=row.Sessions;
                    }
                    mentor.SectionStats=stats.Values.OrderBy(v=>v.SectionCode).ToList();
                }
            }

            int total   = mentors.Sum(m => m.TotalAttendees);
            int present = mentors.Sum(m => m.PresentCount);
            double rate = total > 0 ? Math.Round((double)present / total * 100, 1) : 0;
            rate = MonitorActivitiesService.ClampPercent(rate);

            return new AttendanceOverviewDto
            {
                TotalRecords    = total,
                PresentCount    = present,
                AbsentCount     = total - present,
                AttendanceRate  = rate,
                Mentors         = mentors
            };
        }

        // ── Mentor detail: mentor info + one card per assigned mentee ─────────
        public async Task<AttendanceMentorDetailDto> GetMentorMenteesAsync(int mentorId)
        {
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync(
                "EXEC sp_GetMentorMenteeAttendance @MentorID", new { MentorID = mentorId });
            var settings         = await multi.ReadFirstOrDefaultAsync<AttendanceRequiredSessionsRow>();
            int requiredSessions = settings?.RequiredSessions ?? 6;
            var mentor           = await multi.ReadFirstOrDefaultAsync<AttendanceMentorInfoDto>();
            var mentees          = (await multi.ReadAsync<AttendanceMenteeCardDto>()).ToList();
            multi.Dispose();
            await ApplyCourseAttendanceAsync(conn,mentorId,mentees);
            return new AttendanceMentorDetailDto { Mentor = mentor, Mentees = mentees, RequiredSessions = requiredSessions };
        }
        private static async Task ApplyCourseAttendanceAsync(SqlConnection conn,int mentorId,List<AttendanceMenteeCardDto> mentees)
        {
            var period=(await conn.QueryAsync<(string Key,string Value)>("SELECT SettingKey AS [Key],SettingValue AS Value FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')")).ToDictionary(r=>r.Key,r=>r.Value);
            var rows=(await conn.QueryAsync<(int MentorID,int MenteeID,string SlotName,int Attended)>(CourseWorkflow.MenteeCheckpointAttendanceSql,new {MentorIds=new[]{mentorId},SchoolYear=period.GetValueOrDefault("SchoolYear"),Semester=period.GetValueOrDefault("Semester")})).ToLookup(r=>r.MenteeID);
            foreach(var m in mentees){m.TotalSessions=rows[m.MenteeID].Count();m.PresentCount=rows[m.MenteeID].Sum(r=>r.Attended);}
            if(mentees.Count==0)return;
            var dropOuts=(await conn.QueryAsync<int>("SELECT UserID FROM MenteeProfiles WHERE ISNULL(IsDropOut,0)=1 AND UserID IN @Ids",new {Ids=mentees.Select(m=>m.MenteeID).ToArray()})).ToHashSet();
            foreach(var m in mentees)m.IsDropOut=dropOuts.Contains(m.MenteeID);
        }

        // ── Full report: all mentors + all mentees (two-level print) ─────────
        public async Task<AttendanceFullReportDto> GetFullReportAsync(string? school)
        {
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync(
                "EXEC sp_GetAttendanceFullReport @School", new { School = school });

            var settings         = await multi.ReadFirstOrDefaultAsync<AttendanceRequiredSessionsRow>();
            int requiredSessions = settings?.RequiredSessions ?? 6;

            var mentorRows = (await multi.ReadAsync<AttendanceFullReportMentorRow>()).ToList();
            var menteeRows = (await multi.ReadAsync<AttendanceFullReportMenteeRow>()).ToList();

            var menteesByMentor = menteeRows
                .GroupBy(m => m.MentorID)
                .ToDictionary(g => g.Key, g => g.Select(m => new AttendanceMenteeCardDto
                {
                    MenteeID        = m.MenteeID,
                    MenteeFirstName = m.MenteeFirstName,
                    MenteeLastName  = m.MenteeLastName,
                    StudentNumber   = m.StudentNumber,
                    SectionCode     = m.SectionCode,
                    Course          = m.Course,
                    YearLevel       = m.YearLevel,
                    TotalSessions   = m.TotalSessions,
                    PresentCount    = m.PresentCount
                }).ToList());

            var mentors = mentorRows.Select(r => new AttendanceFullReportMentorDto
            {
                MentorID      = r.MentorID,
                FirstName     = r.FirstName,
                LastName      = r.LastName,
                Department    = r.Department,
                School        = r.School,
                TotalSessions = r.TotalSessions,
                Mentees       = menteesByMentor.TryGetValue(r.MentorID, out var list) ? list : new()
            }).ToList();

            multi.Dispose();
            foreach(var mentor in mentors)await ApplyCourseAttendanceAsync(conn,mentor.MentorID,mentor.Mentees);
            return new AttendanceFullReportDto { RequiredSessions = requiredSessions, Mentors = mentors };
        }

        // ── Mentee session history (for a specific mentor's sessions) ─────────
        public async Task<List<MenteeSessionHistoryDto>> GetMenteeHistoryAsync(int menteeId, int mentorId)
        {
            using var conn = new SqlConnection(_connectionString);
            return (await conn.QueryAsync<MenteeSessionHistoryDto>("""
                WITH eligible AS (
                    SELECT s.*,CAST(CASE WHEN s.RequestID IS NULL THEN 0 ELSE 1 END AS bit) IsMakeup,
                        CAST(CASE WHEN scope.SessionID IS NULL THEN 0 ELSE 1 END AS bit) CourseScoped,
                        scope.School CourseSchool,scope.CourseCode
                    FROM Sessions s
                    LEFT JOIN SessionCourseMembers scope ON scope.SessionID=s.SessionID AND scope.MenteeID=@MenteeID
                    WHERE s.Status<>'Cancelled' AND (s.MentorID=@MentorID AND (
                        scope.SessionID IS NOT NULL
                        OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND (
                            (s.RequestID IS NULL AND EXISTS(SELECT 1 FROM MentorMentee mm WHERE mm.MentorID=s.MentorID AND mm.MenteeID=@MenteeID AND mm.IsActive=1)
                              AND (s.SectionCode IS NULL OR s.SectionCode=(SELECT COALESCE(sec.SectionCode,mp.Section) FROM MenteeProfiles mp LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID WHERE mp.UserID=@MenteeID)
                                OR (SELECT COALESCE(sec.SectionCode,mp.Section) FROM MenteeProfiles mp LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID WHERE mp.UserID=@MenteeID) IS NULL))
                            OR (s.RequestID IS NOT NULL AND EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.RequestID=s.RequestID AND sr.MenteeID=@MenteeID AND sr.Status='Approved')))))
                        -- This period's checkpoint the mentee attended with a previous mentor.
                        OR (s.MentorID<>@MentorID AND s.Status='Completed' AND s.TimeEnd IS NOT NULL AND s.SlotName IS NOT NULL
                            AND s.SchoolYear=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear')
                            AND s.Semester=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester')
                            AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
                            AND EXISTS(SELECT 1 FROM MentorMentee mm WHERE mm.MentorID=@MentorID AND mm.MenteeID=@MenteeID AND mm.IsActive=1)
                            AND EXISTS(SELECT 1 FROM Attendance a WHERE a.SessionID=s.SessionID AND a.MenteeID=@MenteeID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
                                AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                                    AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                                    AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                                    AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)))))
                ), joined AS (
                    SELECT s.SessionID,s.SessionDate,s.SlotName,s.IsMakeup,s.CourseScoped,s.SchoolYear,s.Semester,s.CourseSchool,s.CourseCode,
                        s.Status SessionStatus,CASE WHEN s.IsMakeup=1 THEN COALESCE(s.SlotName,'Make-up Session')
                            WHEN s.SectionCode IS NOT NULL THEN LTRIM(SUBSTRING(s.Notes,CHARINDEX(']',s.Notes)+1,LEN(s.Notes)))
                            ELSE COALESCE(s.Notes,'Mentoring Session') END Topic,COALESCE(a.AttendanceID,0) AttendanceID,
                        ISNULL(a.IsPresent,0) IsPresent,a.ScannedAt,a.AbsenceReason,a.MentorNotes,
                        CAST(CASE WHEN a.AttendanceID IS NULL THEN 0 ELSE 1 END AS bit) IsRecorded
                    FROM eligible s LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=@MenteeID
                ), ranked AS (
                    SELECT *,ROW_NUMBER() OVER(PARTITION BY CourseScoped,
                        CASE WHEN CourseScoped=1 THEN SchoolYear ELSE '' END,
                        CASE WHEN CourseScoped=1 THEN Semester ELSE '' END,
                        CASE WHEN CourseScoped=1 THEN CourseSchool ELSE '' END,
                        CASE WHEN CourseScoped=1 THEN CourseCode ELSE '' END,
                        COALESCE(SlotName,CAST(SessionID AS nvarchar(20)))
                        ORDER BY IsPresent DESC,SessionDate DESC,SessionID DESC) rn
                    FROM joined
                ) SELECT * FROM ranked WHERE rn=1 ORDER BY SessionDate DESC
                """,new {MenteeID=menteeId,MentorID=mentorId})).ToList();
        }
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public class AttendanceOverviewDto
    {
        public int                           TotalRecords   { get; set; }
        public int                           PresentCount   { get; set; }
        public int                           AbsentCount    { get; set; }
        public double                        AttendanceRate { get; set; }
        public List<AttendanceMentorCardDto> Mentors        { get; set; } = new();
    }

    public class AttendanceSummaryDto
    {
        public int TotalRecords  { get; set; }
        public int PresentCount  { get; set; }
        public int AbsentCount   { get; set; }
    }

    public class AttendanceMentorCardDto
    {
        public int       MentorID        { get; set; }
        public string    FirstName       { get; set; } = string.Empty;
        public string    LastName        { get; set; } = string.Empty;
        public string?   Department      { get; set; }
        public string?   School          { get; set; }
        public int       TotalSessions   { get; set; }
        public int       TotalAttendees  { get; set; }
        public int       PresentCount    { get; set; }
        public DateTime? LastSessionDate { get; set; }
        public string?   Sections        { get; set; }
        public string?   Courses         { get; set; }
        public List<AttendanceSectionStatDto> SectionStats { get; set; } = new();
    }

    public class AttendanceSectionStatDto
    {
        public string SectionCode { get; set; } = string.Empty;
        public int    Records     { get; set; }
        public int    Present     { get; set; }
        public int    Sessions    { get; set; }
    }

    public class AttendanceMentorInfoDto
    {
        public int     MentorID   { get; set; }
        public string  FirstName  { get; set; } = string.Empty;
        public string  LastName   { get; set; } = string.Empty;
        public string? Email      { get; set; }
        public string? Department { get; set; }
        public string? School     { get; set; }
        public string? Sections   { get; set; }
        public string? Courses    { get; set; }
    }

    public class AttendanceMentorDetailDto
    {
        public AttendanceMentorInfoDto?      Mentor           { get; set; }
        public List<AttendanceMenteeCardDto> Mentees          { get; set; } = new();
        public int                           RequiredSessions { get; set; }
    }

    public class AttendanceMenteeCardDto
    {
        public int     MenteeID        { get; set; }
        public string  MenteeFirstName { get; set; } = string.Empty;
        public string  MenteeLastName  { get; set; } = string.Empty;
        public string? StudentNumber   { get; set; }
        public string? SectionCode     { get; set; }
        public string? Course          { get; set; }
        public string? YearLevel       { get; set; }
        public int     TotalSessions   { get; set; }
        public int     PresentCount    { get; set; }
        public bool    IsDropOut       { get; set; }
    }

    public class MenteeSessionHistoryDto
    {
        public int       AttendanceID  { get; set; }
        public string?   SlotName      { get; set; }
        public bool      IsMakeup      { get; set; }
        public DateTime? SessionDate   { get; set; }
        public string?   Topic         { get; set; }
        public string    SessionStatus { get; set; } = string.Empty;
        public bool      IsPresent     { get; set; }
        public bool      IsRecorded    { get; set; }
        public DateTime? ScannedAt     { get; set; }
        public string?   AbsenceReason { get; set; }
        public string?   MentorNotes   { get; set; }
    }

    public class AttendanceFullReportDto
    {
        public int                                  RequiredSessions { get; set; }
        public List<AttendanceFullReportMentorDto>  Mentors          { get; set; } = new();
    }

    public class AttendanceFullReportMentorDto
    {
        public int                           MentorID      { get; set; }
        public string                        FirstName     { get; set; } = string.Empty;
        public string                        LastName      { get; set; } = string.Empty;
        public string?                       Department    { get; set; }
        public string?                       School        { get; set; }
        public int                           TotalSessions { get; set; }
        public List<AttendanceMenteeCardDto> Mentees       { get; set; } = new();
    }

    internal class AttendanceFullReportMentorRow
    {
        public int     MentorID      { get; set; }
        public string  FirstName     { get; set; } = string.Empty;
        public string  LastName      { get; set; } = string.Empty;
        public string? Department    { get; set; }
        public string? School        { get; set; }
        public int     TotalSessions { get; set; }
    }

    internal class AttendanceFullReportMenteeRow
    {
        public int     MentorID        { get; set; }
        public int     MenteeID        { get; set; }
        public string  MenteeFirstName { get; set; } = string.Empty;
        public string  MenteeLastName  { get; set; } = string.Empty;
        public string? StudentNumber   { get; set; }
        public string? SectionCode     { get; set; }
        public string? Course          { get; set; }
        public string? YearLevel       { get; set; }
        public int     TotalSessions   { get; set; }
        public int     PresentCount    { get; set; }
    }

    internal class AttendanceRequiredSessionsRow { public int RequiredSessions { get; set; } }

    // Kept for any internal use
    public class MentorFilterDto
    {
        public int     MentorID   { get; set; }
        public string  FirstName  { get; set; } = string.Empty;
        public string  LastName   { get; set; } = string.Empty;
        public string? School     { get; set; }
        public string? Department { get; set; }
    }
}
