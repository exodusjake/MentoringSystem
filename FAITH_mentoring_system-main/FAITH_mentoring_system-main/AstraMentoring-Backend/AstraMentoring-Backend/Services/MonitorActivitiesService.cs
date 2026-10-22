using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class MonitorActivitiesService
    {
        private readonly string _connectionString;
        private readonly EvaluationRatingsService _ratingsService;

        public MonitorActivitiesService(IConfiguration config, EvaluationRatingsService ratingsService)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
            _ratingsService = ratingsService;
        }

        // Overall % = Timeliness (25%) + Completeness (25%) + Evaluation
        // Rating (50%) — the real FAITH ranking formula (Phase 3), replacing
        // the interim progressPercent-only sort used since Phase 1. A
        // missing Evaluation Rating scores 0 for that 50%, per the client's
        // "missing = worst" rule — never excluded from ranking entirely.
        //
        // Completeness uses submitted checkpoint documents; timeliness uses the
        // approved late-report brackets and only deadlines that have passed.
        public static double ClampPercent(double value)
        {
            if (double.IsNaN(value) || double.IsInfinity(value)) return 0;
            return Math.Min(100, Math.Max(0, value));
        }

        private static double ComputeOverallPercent(int lateCount, int timelinessRequired, double completeness, decimal? evaluationRatingPct)
        {
            double timelinessScore = ComputeTimelinessScore(lateCount, timelinessRequired);
            double rating          = (double)(evaluationRatingPct ?? 0);
            return timelinessScore + completeness * 0.25 + rating * 0.50;
        }

        // ALL required reports late takes precedence over the four/five bracket.
        // Future deadlines do not count as late; repeated sessions add no reports.
        private static double ComputeTimelinessScore(int lateCount, int totalRequired)
        {
            if (totalRequired > 0 && lateCount >= totalRequired) return 7;
            return lateCount switch
            {
                <= 0 => 25,
                <= 2 => 21,
                3 => 19,
                <= 5 => 11,
                _ => throw new ArgumentOutOfRangeException(nameof(lateCount))
            };
        }

        public async Task<bool> IsMenteeAssignedToMentorAsync(int menteeId, int mentorId)
        {
            using var conn = new SqlConnection(_connectionString);
            var count = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM dbo.MentorMentee WHERE MenteeID = @MenteeID AND MentorID = @MentorID AND IsActive = 1",
                new { MenteeID = menteeId, MentorID = mentorId });
            return count > 0;
        }

        // includeInactive: the default (false) page load never changes —
        // same Active-only roster and the same Critical/Behind/On Track/
        // Excellent stat-card counts as before. The frontend only passes
        // true when its School Year filter is set to a specific PAST
        // period, to also surface mentors who have since gone Inactive/
        // Drop Out but genuinely had an account during that period.
        //
        // schoolYear/semester: null (the default) keeps every stat scoped
        // to whatever SystemSettings currently says. When the frontend's
        // School Year filter selects a past period, it passes both here so
        // CompletedSessions/OnTimeCount/CompleteCount/dates are computed
        // against THAT period instead of silently staying on the current
        // one — previously every stat column stayed on the current period
        // even when a past one was selected, only the mentor roster itself
        // was actually being filtered.
        public async Task<MentorOverviewListDto> GetMentorOverviewAsync(bool includeInactive = false, string? schoolYear = null, string? semester = null, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync(new CommandDefinition(
                OverviewMetadataSql,
                new { IncludeInactive = includeInactive, SchoolYear = schoolYear, Semester = semester }, cancellationToken: cancellationToken));
            var settings         = await multi.ReadFirstOrDefaultAsync<RequiredSessionsRow>();
            int requiredSessions = CheckpointWindowPolicy.RequiredCheckpointCount(settings?.Semester);
            var mentors          = (await multi.ReadAsync<MentorOverviewDto>()).ToList();
            multi.Dispose();

            var sectionProgress = mentors.Count > 0
                ? (await conn.QueryAsync<MentorSectionProgressDto>(new CommandDefinition(SectionProgressSql, new
                {
                    MentorIds = mentors.Select(m => m.MentorID).ToArray(),
                    SchoolYear = settings?.SchoolYear,
                    Semester = settings?.Semester,
                    RequiredSessions = requiredSessions
                }, cancellationToken: cancellationToken))).ToLookup(row => row.MentorID)
                : Enumerable.Empty<MentorSectionProgressDto>().ToLookup(row => row.MentorID);

            // Course reports are read once per mentor and reused for scoring and course progress.
            var courseReportCache = new Dictionary<int, List<CheckpointReportStatusDto>>();
            var lateReports = mentors.Count > 0
                ? await GetReportStatesAsync(conn, mentors.Select(m => m.MentorID).ToArray(), settings?.SchoolYear, settings?.Semester, cancellationToken: cancellationToken, courseReportCache: courseReportCache, parallelConnectionString: _connectionString)
                : new Dictionary<int, ReportState>();
            var checkpointRows = mentors.Count > 0
                ? (await conn.QueryAsync<CheckpointSummary>(new CommandDefinition(CheckpointSummarySql, new { MentorIds = mentors.Select(m => m.MentorID).ToArray(), SchoolYear = settings?.SchoolYear, Semester = settings?.Semester }, cancellationToken: cancellationToken))).ToLookup(r => r.MentorID)
                : Enumerable.Empty<CheckpointSummary>().ToLookup(r => r.MentorID);
            var ratings = (settings?.SchoolYear != null && settings.Semester != null)
                ? await _ratingsService.GetAllForPeriodAsync(settings.SchoolYear, settings.Semester, cancellationToken)
                : new Dictionary<int, decimal>();

            foreach (var m in mentors)
            {
                m.CompletedSlots = checkpointRows[m.MentorID].Where(r => r.Completed).Select(r => r.SlotName).ToList();
                m.SlotAttendance = string.Join(", ", checkpointRows[m.MentorID].Select(r => $"{r.SlotName}:{r.Attendees}"));
                m.SectionProgress = sectionProgress[m.MentorID].ToList();
            }
            // Per-mentor course progress queries are independent, so they run side by side on their own connections.
            if (settings?.SchoolYear != null && settings.Semester != null)
                await ForEachParallelAsync(mentors, cancellationToken, async (m, ct) =>
                {
                    using var mentorConn = new SqlConnection(_connectionString);
                    await CourseWorkflow.ApplyProgressAsync(mentorConn, m.MentorID, settings.SchoolYear, settings.Semester, m.SectionProgress, courseReportCache.GetValueOrDefault(m.MentorID));
                });

            foreach (var m in mentors)
            {
                ApplyCheckpointMetrics(m, m.SectionProgress);
                // Scale required sessions by number of sections this mentor handles
                int effective     = requiredSessions * Math.Max(1, m.SectionCount);
                m.RequiredSessions = effective;
                double pct = effective > 0
                    ? (double)m.CompletedSessions / effective * 100 : 0;
                m.ProgressPercent = Math.Min(100, Math.Round(pct, 1));

                ratings.TryGetValue(m.MentorID, out var ratingPct);
                m.EvaluationRatingPercent = ratings.ContainsKey(m.MentorID) ? ratingPct : null;
                // Only elapsed deadlines can produce late/missing reports;
                // ALL-LATE uses the full semester requirement, not due dates.
                int timelinessRequired = requiredSessions;
                var reports = lateReports.GetValueOrDefault(m.MentorID) ?? new ReportState();
                int lateCount = reports.LateCount;
                m.LateReportCount = lateCount;
                m.MissingReportCount = reports.MissingCount;
                m.TimelinessPending = IsPerformancePending(reports);
                int scoredLate = LateOrMissing(reports, timelinessRequired);
                m.TimelinessPercent = m.TimelinessPending ? null : ComputeTimelinessScore(scoredLate, timelinessRequired);
                double completeness = CompletenessOfDue(reports);
                m.CompletenessPercent = Math.Round(completeness, 1);
                double overall = ComputeOverallPercent(scoredLate, timelinessRequired, completeness, m.EvaluationRatingPercent);
                m.OverallPercent = m.TimelinessPending ? null : Math.Round(overall, 1);

                m.ProgressStatus  = m.TimelinessPending ? "Pending" : overall >= 80 ? "Excellent"
                                  : overall >= 50 ? "On Track"
                                  : overall >= 25 ? "Behind"
                                  : "Critical";
            }

            return new MentorOverviewListDto
            {
                Mentors   = mentors,
                Critical  = mentors.Count(m => m.ProgressStatus == "Critical"),
                Behind    = mentors.Count(m => m.ProgressStatus == "Behind"),
                OnTrack   = mentors.Count(m => m.ProgressStatus == "On Track"),
                Excellent = mentors.Count(m => m.ProgressStatus == "Excellent")
            };
        }

        // Metadata only; authoritative checkpoint/report metrics are calculated below.
        private const string OverviewMetadataSql = """
                DECLARE @SessionLimit INT = 6;
            
                IF @SchoolYear IS NULL
                    SELECT @SchoolYear = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'SchoolYear';
                IF @Semester IS NULL
                    SELECT @Semester   = SettingValue FROM dbo.SystemSettings WHERE SettingKey = 'Semester';
            
                SELECT @SessionLimit = CAST(SettingValue AS INT) FROM dbo.SystemSettings
                WHERE  SettingKey = CASE WHEN @Semester = '2nd Semester'
                                         THEN 'SessionLimit2ndSem' ELSE 'SessionLimit1stSem' END;
            
                SELECT ISNULL(@SessionLimit, 6) AS RequiredSessions, @SchoolYear AS SchoolYear, @Semester AS Semester;
            
                SELECT
                    u.UserID        AS MentorID,
                    u.FirstName, u.LastName, u.Email, u.ContactNumber,
                    mp.School, d.DepartmentName,
                    mp.SignatureFilePath,
                    u.IsActive                                                                       AS IsActive,
                    (SELECT COUNT(*) FROM dbo.MentorMentee mm
                     WHERE mm.MentorID = u.UserID AND mm.IsActive = 1)                                AS MenteeCount,
                    (SELECT COUNT(DISTINCT COALESCE(sec2.SectionCode, mep2.Section))
                     FROM   dbo.MentorMentee    mm2
                     INNER  JOIN dbo.MenteeProfiles mep2 ON mep2.UserID    = mm2.MenteeID
                     LEFT   JOIN dbo.Sections       sec2 ON sec2.SectionID = mep2.SectionID
                     WHERE  mm2.MentorID = u.UserID AND mm2.IsActive = 1
                       AND  COALESCE(sec2.SectionCode, mep2.Section) IS NOT NULL)                     AS SectionCount,
                    (
                        SELECT STRING_AGG(val, ', ')
                        FROM (
                            SELECT DISTINCT COALESCE(sec3.SectionCode, mep3.Section) AS val
                            FROM   dbo.MentorMentee mm3
                            INNER  JOIN dbo.MenteeProfiles mep3 ON mep3.UserID    = mm3.MenteeID
                            LEFT   JOIN dbo.Sections       sec3 ON sec3.SectionID = mep3.SectionID
                            WHERE  mm3.MentorID = u.UserID AND mm3.IsActive = 1
                              AND  COALESCE(sec3.SectionCode, mep3.Section) IS NOT NULL
                        ) t
                    )                                                                                  AS Sections,
                    (SELECT MAX(s.SessionDate) FROM dbo.Sessions s
                     WHERE s.MentorID = u.UserID AND s.Status = 'Completed'
                       AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)                     AS LastSessionDate,
                    (SELECT MIN(s.SessionDate) FROM dbo.Sessions s
                     WHERE s.MentorID = u.UserID AND s.Status = 'Scheduled'
                       AND s.SessionDate >= CAST(GETDATE() AS DATE)
                       AND s.SchoolYear = @SchoolYear AND s.Semester = @Semester)                     AS NextSessionDate
                FROM   dbo.Users u
                INNER  JOIN dbo.MentorProfiles mp ON mp.UserID     = u.UserID
                LEFT   JOIN dbo.Departments    d  ON d.DepartmentID = mp.DepartmentID
                WHERE  (u.IsActive = 1 OR @IncludeInactive = 1) AND u.Role = 'Mentor'
                ORDER  BY u.LastName, u.FirstName;
            
            """;

        internal static void ApplyCheckpointMetrics(MentorOverviewDto mentor, List<MentorSectionProgressDto> sections)
        {
            mentor.SectionProgress = sections;
            mentor.SectionCount = sections.Count;
            mentor.CompletedSessions = sections.Sum(s => s.CompletedSessions);
            mentor.CompleteCount = sections.Sum(s => s.CompleteCount);
            mentor.OnTimeCount = sections.Sum(s => s.OnTimeCount);
        }

        private sealed class CheckpointSummary
        {
            public int MentorID { get; set; }
            public string SlotName { get; set; } = "";
            public bool Completed { get; set; }
            public int Attendees { get; set; }
        }
        // Attendees: each mentee counts once per checkpoint, for the mentor whose
        // session they were first present at (kept after a transfer or drop-out).
        private const string CheckpointSummarySql = """
            WITH Present AS (
                SELECT s.MentorID,s.SlotName,a.MenteeID,
                    ROW_NUMBER() OVER(PARTITION BY a.MenteeID,s.SlotName ORDER BY a.ScannedAt,s.SessionID) AS Pick
                FROM Sessions s JOIN Attendance a ON a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
                LEFT JOIN MenteeProfiles mp ON mp.UserID=a.MenteeID
                LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
                LEFT JOIN SessionCourseMembers cm ON cm.SessionID=s.SessionID AND cm.MenteeID=a.MenteeID
                OUTER APPLY(SELECT COUNT(*) Scopes FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) scopeCount
                WHERE s.SchoolYear=@SchoolYear AND s.Semester=@Semester
                    AND s.Status='Completed' AND s.TimeEnd IS NOT NULL AND s.SlotName IS NOT NULL
                    AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
                    AND EXISTS (SELECT 1 FROM CalendarEvents e
                        WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                          AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                          AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                          AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
                    AND EXISTS (SELECT 1 FROM MentorMentee mm WHERE mm.MentorID=s.MentorID
                        AND mm.MenteeID=a.MenteeID AND mm.AssignedDate<=s.SessionDate)
                    AND (cm.MenteeID IS NOT NULL
                      OR (scopeCount.Scopes=0
                        AND (s.RequestID IS NOT NULL OR s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section))))
            ), Credited AS (
                SELECT MentorID,SlotName,COUNT(*) AS Attendees FROM Present WHERE Pick=1 GROUP BY MentorID,SlotName
            )
            SELECT s.MentorID,s.SlotName,
                CAST(MAX(CASE WHEN s.Status='Completed' THEN 1 ELSE 0 END) AS bit) AS Completed,
                ISNULL(MAX(cr.Attendees),0) AS Attendees
            FROM Sessions s
            LEFT JOIN Credited cr ON cr.MentorID=s.MentorID AND cr.SlotName=s.SlotName
            WHERE s.MentorID IN @MentorIds AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester
                AND s.Status='Completed' AND s.TimeEnd IS NOT NULL AND s.SlotName IS NOT NULL
                AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
                AND EXISTS (SELECT 1 FROM CalendarEvents e
                    WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                      AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                      AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date)
                          AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
            GROUP BY s.MentorID,s.SlotName
            """;

        private sealed class ReportState
        {
            public int MentorID { get; set; }
            public int DueCount { get; set; }
            public int LateCount { get; set; }
            public int MissingCount { get; set; }
            public int IncompleteCount { get; set; }
        }

        // Pending only until the first checkpoint deadline passes. After that,
        // a missing report counts as late ("missing = worst") so the mentor still
        // gets a tier and shows up for follow-up.
        private static bool IsPerformancePending(ReportState reports) => reports.DueCount == 0;

        private static int LateOrMissing(ReportState reports, int timelinessRequired)
            => Math.Min(timelinessRequired, reports.LateCount + reports.MissingCount);

        // Share of checkpoints whose deadline has passed that have a submitted
        // report with complete documents, so early-semester scores aren't
        // dragged down by checkpoints that aren't due yet.
        private static double CompletenessOfDue(ReportState reports)
            => reports.DueCount == 0 ? 0
             : ClampPercent((double)Math.Max(0, reports.DueCount - reports.MissingCount - reports.IncompleteCount) / reports.DueCount * 100);

        private static async Task<Dictionary<int,int>> GetLateReportsAsync(SqlConnection conn, int[] mentorIds, string? schoolYear, string? semester, System.Data.IDbTransaction? transaction = null)
            => (await GetReportStatesAsync(conn, mentorIds, schoolYear, semester, transaction))
                .ToDictionary(r => r.Key, r => r.Value.LateCount);

        private static async Task<Dictionary<int,ReportState>> GetReportStatesAsync(SqlConnection conn, int[] mentorIds, string? schoolYear, string? semester, System.Data.IDbTransaction? transaction = null, CancellationToken cancellationToken = default, Dictionary<int, List<CheckpointReportStatusDto>>? courseReportCache = null, string? parallelConnectionString = null)
        {
            // Each checkpoint is one required report, even across several sections.
            // DueCount = checkpoints whose deadline has passed.
            var ctes = SectionProgressSql[..SectionProgressSql.IndexOf("SELECT s.MentorID,s.SectionCode,COALESCE", StringComparison.Ordinal)];
            var rows = await conn.QueryAsync<ReportState>(new CommandDefinition(ctes + """
                SELECT sec.MentorID,
                  COUNT(DISTINCT e.SlotName) AS DueCount,
                  COUNT(DISTINCT CASE WHEN m.LogStatus='Submitted' AND m.SubmittedAt IS NOT NULL
                    AND TODATETIMEOFFSET(m.SubmittedAt,DATEPART(TZOFFSET,SYSDATETIMEOFFSET()))>=TODATETIMEOFFSET(CAST(DATEADD(DAY,1,CAST(e.StartDate AS date)) AS datetime2),'+08:00')
                    THEN e.SlotName END) AS LateCount,
                  COUNT(DISTINCT CASE WHEN m.LogStatus IS NULL OR m.LogStatus<>'Submitted' OR m.SubmittedAt IS NULL
                    THEN e.SlotName END) AS MissingCount,
                  COUNT(DISTINCT CASE WHEN m.LogStatus='Submitted' AND m.DocumentsComplete=0
                    THEN e.SlotName END) AS IncompleteCount
                FROM AllSections sec CROSS JOIN CalendarEvents e
                LEFT JOIN Metrics m ON m.MentorID=sec.MentorID AND m.SectionCode=sec.SectionCode AND m.SlotName=e.SlotName
                WHERE e.SchoolYear=@SchoolYear AND e.Semester=@Semester
                  AND e.EventType='Deadline' AND e.IsPublished=1
                  AND DATEADD(DAY,1,CAST(e.StartDate AS date))<=DATEADD(HOUR,8,SYSUTCDATETIME())
                  AND (e.SlotName IN ('Before Prelims','After Prelims','Before Midterms','After Midterms','Before Finals')
                       OR (e.SlotName='Mentoring Assembly' AND @Semester<>'2nd Semester'))
                GROUP BY sec.MentorID
                """, new { MentorIds=mentorIds, SchoolYear=schoolYear, Semester=semester }, transaction, cancellationToken: cancellationToken));
            var result=rows.ToDictionary(r=>r.MentorID);
            if(schoolYear!=null&&semester!=null&&transaction==null)
            {
                // With a connection string each mentor is read on its own connection, a few at a time; otherwise one by one on conn.
                var perMentor=new System.Collections.Concurrent.ConcurrentDictionary<int,(ReportState? State,List<CheckpointReportStatusDto> Reports)>();
                async Task ReadMentorAsync(SqlConnection c,int mentorId)
                {
                    if(await c.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE s.MentorID=@mentorId AND s.SchoolYear=@schoolYear AND s.Semester=@semester",new {mentorId,schoolYear,semester})==0)
                    {
                        // Same check CourseWorkflow.ReportsAsync starts with: no course sessions means no course reports.
                        perMentor[mentorId]=(null,new List<CheckpointReportStatusDto>());
                        return;
                    }
                    var local=new Dictionary<int,List<CheckpointReportStatusDto>>();
                    var reports=await ReadReportStatusesAsync(c,mentorId,schoolYear,semester,local);
                    var due=reports.Where(r=>r.DeadlineExclusive.HasValue&&r.DeadlineExclusive<=DateTimeOffset.UtcNow).GroupBy(r=>r.SlotName).ToArray();
                    perMentor[mentorId]=(new ReportState {MentorID=mentorId,DueCount=due.Length,LateCount=due.Count(g=>g.Any(r=>r.LogStatus=="Submitted"&&r.SubmittedAt>=r.DeadlineExclusive)),MissingCount=due.Count(g=>g.Any(r=>r.LogStatus!="Submitted"||!r.SubmittedAt.HasValue)),IncompleteCount=due.Count(g=>g.Any(r=>r.LogStatus=="Submitted"&&!r.DocumentsComplete))},local.GetValueOrDefault(mentorId)??new List<CheckpointReportStatusDto>());
                }
                if(parallelConnectionString!=null)
                    await ForEachParallelAsync(mentorIds,cancellationToken,async (mentorId,ct)=>{using var mentorConn=new SqlConnection(parallelConnectionString);await ReadMentorAsync(mentorConn,mentorId);});
                else
                    foreach(var mentorId in mentorIds)await ReadMentorAsync(conn,mentorId);
                foreach(var mentorId in mentorIds)
                {
                    var (state,reports)=perMentor[mentorId];
                    courseReportCache?.TryAdd(mentorId,reports);
                    if(state!=null)result[mentorId]=state;
                }
            }
            return result;
        }

        // Runs work for each item with at most four in flight (each on its own connection, so the pool is not exhausted).
        private static Task ForEachParallelAsync<T>(IEnumerable<T> items, CancellationToken cancellationToken, Func<T, CancellationToken, Task> work)
            => Parallel.ForEachAsync(items, new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = cancellationToken },
                async (item, ct) => await work(item, ct));

        // Official credit uses the current published schedule; raw history is retained
        // separately. There is no published-calendar version history to grandfather
        // eligibility after calendar edits. Count each section/checkpoint once.
        private const string SectionProgressSql = """
            WITH EligibleSessions AS (
                SELECT s.* FROM Sessions s
                WHERE s.MentorID IN @MentorIds AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester
                  AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
                  AND NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                  AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
                  AND EXISTS (SELECT 1 FROM CalendarEvents e
                      WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                        AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                        AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date)
                            AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
            ), CurrentSections AS (
                SELECT DISTINCT mm.MentorID, COALESCE(sec.SectionCode, mp.Section) AS SectionCode
                FROM MentorMentee mm JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID
                LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
                WHERE mm.MentorID IN @MentorIds AND mm.IsActive=1
                  AND @SchoolYear=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear')
                  AND @Semester=(SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester')
                  AND COALESCE(sec.SectionCode,mp.Section) IS NOT NULL
            ), Sources AS (
                SELECT s.MentorID,s.SectionCode,s.SlotName,s.SessionID,s.SessionDate,s.Status,
                       s.LogStatus,s.SubmittedAt,0 AS IsMakeup
                FROM EligibleSessions s WHERE s.MentorID IN @MentorIds
                  AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status<>'Cancelled'
                  AND s.RequestID IS NULL AND s.SectionCode IS NOT NULL AND s.SlotName IS NOT NULL
                UNION
                SELECT s.MentorID,COALESCE(sec.SectionCode,mp.Section),s.SlotName,s.SessionID,s.SessionDate,
                       s.Status,s.LogStatus,s.SubmittedAt,1
                FROM EligibleSessions s JOIN Attendance a ON a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
                JOIN MenteeProfiles mp ON mp.UserID=a.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
                WHERE s.MentorID IN @MentorIds AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester
                  AND s.Status<>'Cancelled' AND (s.RequestID IS NOT NULL OR s.SectionCode IS NULL)
                  AND s.SlotName IS NOT NULL AND COALESCE(sec.SectionCode,mp.Section) IS NOT NULL
                  AND EXISTS (SELECT 1 FROM CalendarEvents e
                      WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                        AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                        AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                        AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
            ), Ranked AS (
                SELECT *,ROW_NUMBER() OVER(PARTITION BY MentorID,SectionCode,SlotName ORDER BY IsMakeup,SessionDate,SessionID) AS rn,
                    MAX(CASE WHEN Status='Completed' THEN 1 ELSE 0 END) OVER(PARTITION BY MentorID,SectionCode,SlotName) AS Completed
                FROM Sources
            ), Checkpoints AS (
                SELECT r.MentorID,r.SectionCode,r.SlotName,r.Completed,
                    CAST(CASE WHEN c.MentorID IS NULL THEN CASE WHEN r.LogStatus<>'Submitted' AND r.SubmittedAt IS NOT NULL THEN 1 ELSE 0 END ELSE c.NeedsUpdate END AS bit) AS NeedsUpdate,
                    CASE WHEN c.MentorID IS NULL THEN r.LogStatus
                         WHEN c.NeedsUpdate=1 THEN 'Draft' ELSE c.LogStatus END AS LogStatus,
                    CASE WHEN c.MentorID IS NULL THEN r.SubmittedAt ELSE c.SubmittedAt END AS SubmittedAt
                FROM Ranked r LEFT JOIN CheckpointLogs c ON c.MentorID=r.MentorID AND c.SectionCode=r.SectionCode
                  AND c.SlotName=r.SlotName AND c.SchoolYear=@SchoolYear AND c.Semester=@Semester
                WHERE r.rn=1
            ), Documents AS (
                SELECT c.*,CASE WHEN c.LogStatus='Submitted'
                    AND EXISTS (SELECT 1 FROM MentorProfiles mp WHERE mp.UserID=c.MentorID
                        AND NULLIF(LTRIM(RTRIM(mp.SignatureFilePath)),'') IS NOT NULL)
                    AND EXISTS (SELECT 1 FROM Sources src JOIN ProofOfSession p ON p.SessionID=src.SessionID
                        WHERE src.MentorID=c.MentorID AND src.SectionCode=c.SectionCode AND src.SlotName=c.SlotName
                          AND NULLIF(LTRIM(RTRIM(p.FilePath)),'') IS NOT NULL)
                    THEN 1 ELSE 0 END AS DocumentsComplete
                FROM Checkpoints c
            ), Metrics AS (
                SELECT c.*,CASE WHEN c.DocumentsComplete=1 AND EXISTS (
                    SELECT 1 FROM CalendarEvents e WHERE e.SchoolYear=@SchoolYear AND e.Semester=@Semester
                      AND e.SlotName=c.SlotName AND e.EventType='Deadline' AND e.IsPublished=1 AND DATEADD(DAY,1,CAST(e.StartDate AS date))<=DATEADD(HOUR,8,SYSUTCDATETIME())
                      AND TODATETIMEOFFSET(c.SubmittedAt,DATEPART(TZOFFSET,SYSDATETIMEOFFSET()))<TODATETIMEOFFSET(CAST(DATEADD(DAY,1,CAST(e.StartDate AS date)) AS datetime2),'+08:00')) THEN 1 ELSE 0 END AS OnTime
                FROM Documents c
            ), AllSections AS (
                SELECT MentorID,SectionCode FROM CurrentSections
                UNION SELECT MentorID,SectionCode FROM Checkpoints
                UNION SELECT MentorID,SectionCode FROM Sessions
                    WHERE MentorID IN @MentorIds AND SchoolYear=@SchoolYear AND Semester=@Semester
                      AND RequestID IS NULL AND SectionCode IS NOT NULL AND Status<>'Cancelled'
                      AND NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=Sessions.SessionID)
            )
            SELECT s.MentorID,s.SectionCode,COALESCE(SUM(m.Completed),0) AS CompletedSessions,
                COALESCE(SUM(m.DocumentsComplete),0) AS CompleteCount,
                COALESCE(SUM(m.OnTime),0) AS OnTimeCount,@RequiredSessions AS RequiredSessions,
                CAST(CASE WHEN cs.MentorID IS NULL THEN 0 ELSE 1 END AS bit) AS IsCurrentlyHandled
            FROM AllSections s LEFT JOIN Metrics m ON m.MentorID=s.MentorID AND m.SectionCode=s.SectionCode
            LEFT JOIN CurrentSections cs ON cs.MentorID=s.MentorID AND cs.SectionCode=s.SectionCode
            GROUP BY s.MentorID,s.SectionCode,cs.MentorID ORDER BY s.MentorID,s.SectionCode;

            """;

        public async Task<List<CheckpointReportStatusDto>> GetCheckpointReportStatusesAsync(int mentorId, string? schoolYear, string? semester)
        {
            using var conn = new SqlConnection(_connectionString);
            if (schoolYear == null && semester == null)
            {
                var settings = (await conn.QueryAsync<(string Key, string Value)>("SELECT SettingKey,SettingValue FROM SystemSettings WHERE SettingKey IN ('SchoolYear','Semester')")).ToDictionary(r => r.Key, r => r.Value);
                schoolYear = settings.GetValueOrDefault("SchoolYear");
                semester = settings.GetValueOrDefault("Semester");
            }
            if (schoolYear == null || semester == null) throw new ArgumentException("Select both school year and semester.");
            SettingsService.ValidatePeriodTransition(schoolYear, semester, null, null);
            return await ReadReportStatusesAsync(conn,mentorId,schoolYear,semester);
        }

        private static async Task<List<CheckpointReportStatusDto>> ReadReportStatusesAsync(SqlConnection conn,int mentorId,string schoolYear,string semester,Dictionary<int,List<CheckpointReportStatusDto>>? courseReportCache=null)
        {
            var ctes = SectionProgressSql[..SectionProgressSql.IndexOf("SELECT s.MentorID,s.SectionCode,COALESCE", StringComparison.Ordinal)];
            var rows = (await conn.QueryAsync<CheckpointReportStatusDto>(ctes + """
                SELECT sec.SectionCode,slots.SlotName,@SchoolYear SchoolYear,@Semester Semester,
                    m.LogStatus,m.DocumentsComplete,ISNULL(m.NeedsUpdate,0) NeedsUpdate,
                    TODATETIMEOFFSET(m.SubmittedAt,DATEPART(TZOFFSET,SYSDATETIMEOFFSET())) SubmittedAt,
                    CASE WHEN deadline.EventCount=1 THEN TODATETIMEOFFSET(CAST(DATEADD(DAY,1,CAST(deadline.DeadlineDate AS date)) AS datetime2),'+08:00') END DeadlineExclusive
                FROM AllSections sec
                CROSS JOIN (VALUES ('Mentoring Assembly'),('Before Prelims'),('After Prelims'),('Before Midterms'),('After Midterms'),('Before Finals')) slots(SlotName)
                LEFT JOIN Metrics m ON m.MentorID=sec.MentorID AND m.SectionCode=sec.SectionCode AND m.SlotName=slots.SlotName
                OUTER APPLY (SELECT COUNT(*) EventCount,MAX(e.StartDate) DeadlineDate FROM CalendarEvents e
                    WHERE e.EventType='Deadline' AND e.IsPublished=1 AND e.SchoolYear=@SchoolYear AND e.Semester=@Semester AND e.SlotName=slots.SlotName) deadline
                WHERE @Semester<>'2nd Semester' OR slots.SlotName<>'Mentoring Assembly'
                ORDER BY sec.SectionCode,slots.SlotName
                """, new { MentorIds = new[] { mentorId }, SchoolYear = schoolYear, Semester = semester,
                    RequiredSessions = CheckpointWindowPolicy.RequiredCheckpointCount(semester) })).ToList();
            foreach (var row in rows)
                row.Status = CheckpointReportStatusPolicy.Classify(row.NeedsUpdate, row.LogStatus, row.DocumentsComplete,
                    row.SubmittedAt, row.DeadlineExclusive, DateTimeOffset.UtcNow);
            var courseReports=courseReportCache!=null&&courseReportCache.TryGetValue(mentorId,out var cachedReports)
                ? cachedReports
                : await CourseWorkflow.ReportsAsync(conn,mentorId,schoolYear,semester);
            courseReportCache?.TryAdd(mentorId,courseReports);
            if(courseReports.Count>0)
            {
                rows.RemoveAll(r=>string.IsNullOrWhiteSpace(r.SectionCode));
                foreach(var row in courseReports)
                {
                    var emptyLegacy=await CourseWorkflow.EmptyLegacyGroupsAsync(conn,mentorId,schoolYear,semester,new CourseGroup(row.CourseSchool!,row.SectionCode));
                    rows.RemoveAll(r=>r.CourseSchool==null&&emptyLegacy.Contains(r.SectionCode));
                    var legacy=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Sessions s WHERE s.MentorID=@mentorId AND s.SchoolYear=@schoolYear AND s.Semester=@semester AND s.SectionCode=@SectionCode AND NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)",new {mentorId,schoolYear,semester,row.SectionCode});
                    if(legacy==0)rows.RemoveAll(r=>r.SectionCode==row.SectionCode&&r.CourseSchool==null);
                    rows.Add(row);
                }
            }
            return rows;
        }

        public async Task<MentorDetailDto?> GetMentorDetailAsync(int mentorId)
        {
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync(
                "EXEC sp_GetMentorDetail @MentorID", new { MentorID = mentorId });
            var settings         = await multi.ReadFirstOrDefaultAsync<RequiredSessionsRow>();
            int requiredSessions = CheckpointWindowPolicy.RequiredCheckpointCount(settings?.Semester);
            var info             = await multi.ReadFirstOrDefaultAsync<MentorOverviewDto>();

            if (info == null) return null;

            var sessions = (await multi.ReadAsync<SessionDetailDto>()).ToList();
            var mentees  = (await multi.ReadAsync<MenteeDetailDto>()).ToList();

            multi.Dispose();
            // Each mentee's attendance: the same rows Attendance Logs shows.
            if(settings?.SchoolYear!=null&&settings.Semester!=null)
            {
                var attendance=(await conn.QueryAsync<(int MentorID,int MenteeID,string SlotName,int Attended)>(CourseWorkflow.MenteeCheckpointAttendanceSql,new {MentorIds=new[]{mentorId},settings.SchoolYear,settings.Semester})).ToLookup(r=>r.MenteeID);
                foreach(var me in mentees){me.TotalCompleted=attendance[me.MenteeID].Count();me.SessionsAttended=attendance[me.MenteeID].Sum(r=>r.Attended);}
            }
            if(settings?.SchoolYear!=null&&settings.Semester!=null && await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE s.MentorID=@mentorId AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester",new {mentorId,settings.SchoolYear,settings.Semester})>0)
            {
                var sessionService=new SessionsAdminService(new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{["ConnectionStrings:DefaultConnection"]=_connectionString}).Build());
                foreach(var session in sessions)
                {
                    if(await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes WHERE SessionID=@SessionID AND Origin='Regular'",new {session.SessionID})==0)continue;
                    session.TotalMentees=(await sessionService.GetSessionMenteesAsync(session.SessionID)).Count;
                }
                var credits=(await conn.QueryAsync<(int MentorID,int MenteeID,string SlotName)>(CourseWorkflow.CreditedAttendanceSql,new {MentorIds=new[]{mentorId},settings.SchoolYear,settings.Semester})).GroupBy(r=>r.SlotName);
                info.SlotAttendance=string.Join(", ",credits.Select(g=>$"{g.Key}:{g.Count()}"));
            }

            foreach (var s in sessions)
                s.AttendancePercentage = s.TotalMentees > 0
                    ? ClampPercent(Math.Round((double)s.PresentCount / s.TotalMentees * 100, 1)) : 0;

            foreach (var me in mentees)
            {
                me.TotalSessions = requiredSessions;
                if (me.TotalCompleted == 0)
                {
                    me.Status = "No Sessions";
                }
                else
                {
                    double rate = (double)me.SessionsAttended / me.TotalCompleted * 100;
                    me.Status = rate >= 80 ? "Excellent"
                              : rate >= 60 ? "On Track"
                              : rate >= 40 ? "Behind"
                              : rate >= 20 ? "At Risk"
                              : "Critical";
                }
            }

            multi.Dispose();
            var progress = (await conn.QueryAsync<MentorSectionProgressDto>(SectionProgressSql, new {
                MentorIds = new[] { mentorId }, SchoolYear = settings?.SchoolYear,
                Semester = settings?.Semester, RequiredSessions = requiredSessions
            })).ToList();
            if(settings?.SchoolYear!=null&&settings.Semester!=null)await CourseWorkflow.ApplyProgressAsync(conn,mentorId,settings.SchoolYear,settings.Semester,progress);
            ApplyCheckpointMetrics(info, progress);
            int completed = info.CompletedSessions;
            // sessions is now the mentor's FULL history (RS3 no longer
            // filters by period -- see fix_mentor_detail_session_history.sql),
            // so this average must scope itself back to the current period
            // to match CompletedSessions above and keep this a "this
            // semester" figure, same as before that fix.
            double avgAtt = sessions
                .Where(s => s.Status == "Completed" && s.TotalMentees > 0
                    && s.SchoolYear == settings?.SchoolYear && s.Semester == settings?.Semester)
                .DefaultIfEmpty()
                .Average(s => s?.AttendancePercentage ?? 0);
            avgAtt = ClampPercent(avgAtt);

            // Scale required by section count so a 2-section mentor needs 12 sessions, not 6
            int effectiveRequired = requiredSessions * Math.Max(1, info?.SectionCount ?? 1);
            double pct = effectiveRequired > 0
                ? (double)completed / effectiveRequired * 100 : 0;

            decimal? ratingPct = (settings?.SchoolYear != null && settings.Semester != null)
                ? await _ratingsService.GetAsync(mentorId, settings.SchoolYear, settings.Semester)
                : null;
            // Only elapsed deadlines can produce late/missing reports;
            // ALL-LATE uses the full semester requirement, not due dates.
            int timelinessRequired = requiredSessions;
            var reports = (await GetReportStatesAsync(conn, new[] { mentorId }, settings?.SchoolYear, settings?.Semester)).GetValueOrDefault(mentorId) ?? new ReportState();
            int lateCount = reports.LateCount;
            bool timelinessPending = IsPerformancePending(reports);
            int scoredLate = LateOrMissing(reports, timelinessRequired);
            double completeness = CompletenessOfDue(reports);
            double overall = ComputeOverallPercent(scoredLate, timelinessRequired, completeness, ratingPct);
            string progressStatus = timelinessPending ? "Pending" : overall >= 80 ? "Excellent"
                                  : overall >= 50 ? "On Track"
                                  : overall >= 25 ? "Behind"
                                  : "Critical";

            return new MentorDetailDto
            {
                MentorID          = info.MentorID,
                FirstName         = info.FirstName,
                LastName          = info.LastName,
                Email             = info.Email,
                ContactNumber     = info.ContactNumber,
                School            = info.School,
                DepartmentName    = info.DepartmentName,
                Sections          = info.Sections,
                CompletedSessions = completed,
                RequiredSessions  = effectiveRequired,
                ProgressPercent   = Math.Min(100, Math.Round(pct, 1)),
                ProgressStatus    = progressStatus,
                TimelinessPercent      = timelinessPending ? null : ComputeTimelinessScore(scoredLate, timelinessRequired),
                TimelinessPending      = timelinessPending,
                LateReportCount        = lateCount,
                MissingReportCount     = reports.MissingCount,
                CompletenessPercent    = Math.Round(completeness, 1),
                EvaluationRatingPercent = ratingPct,
                OverallPercent          = timelinessPending ? null : Math.Round(overall, 1),
                AverageAttendance = Math.Round(avgAtt, 1),
                ActiveMentees     = mentees.Count(m => !m.IsDropOut && m.TotalCompleted > 0),
                InactiveMentees   = mentees.Count(m => m.IsDropOut || m.TotalCompleted == 0),
                Sessions          = sessions,
                Mentees           = mentees
            };
        }
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    internal class RequiredSessionsRow
    {
        public int     RequiredSessions   { get; set; }
        public string? SchoolYear         { get; set; }
        public string? Semester           { get; set; }
        // How many of the semester's checkpoints have a Deadline
        // (CalendarEvents) that's already passed, as of now — Timeliness's
        // own denominator, scaled by each mentor's SectionCount below.
        public int      DueCheckpointCount { get; set; }
    }

    public class MentorOverviewListDto
    {
        public List<MentorOverviewDto> Mentors { get; set; } = new();
        public int Critical  { get; set; }
        public int Behind    { get; set; }
        public int OnTrack   { get; set; }
        public int Excellent { get; set; }
    }

    public class CheckpointReportStatusDto
    {
        public string SectionCode { get; set; } = "";
        public string? CourseSchool { get; set; }
        public string SlotName { get; set; } = "";
        public string SchoolYear { get; set; } = "";
        public string Semester { get; set; } = "";
        public string? LogStatus { get; set; }
        public bool DocumentsComplete { get; set; }
        public bool NeedsUpdate { get; set; }
        public DateTimeOffset? SubmittedAt { get; set; }
        public DateTimeOffset? DeadlineExclusive { get; set; }
        public string Status { get; set; } = "Pending";
    }

    public class MentorOverviewDto
    {
        public List<string> CompletedSlots { get; set; } = new();
        public int     MentorID          { get; set; }
        public string  FirstName         { get; set; } = string.Empty;
        public string  LastName          { get; set; } = string.Empty;
        public string  Email             { get; set; } = string.Empty;
        public string? ContactNumber     { get; set; }
        public string? School            { get; set; }
        public string? DepartmentName    { get; set; }
        // Only meaningful when fetched with includeInactive=true — the
        // default fetch already excludes Inactive rows entirely, so every
        // row there is implicitly true.
        public bool    IsActive          { get; set; }
        public int     MenteeCount       { get; set; }
        public int     SectionCount      { get; set; }
        public string? Sections          { get; set; }
        public List<MentorSectionProgressDto> SectionProgress { get; set; } = new();
        public string? SignatureFilePath { get; set; }
        public int     CompletedSessions { get; set; }
        public int     RequiredSessions  { get; set; }
        // Raw ingredients for the Phase 3 ranking formula, bound straight
        // from sp_GetMentorOverview/sp_GetMentorDetail — reduced into the
        // *Percent fields below in MonitorActivitiesService.
        public int     OnTimeCount       { get; set; }
        public int     CompleteCount     { get; set; }
        // Comma-separated "SlotName:AttendeeCount" pairs (one per distinct
        // MentoringSlots checkpoint this mentor has a logged, non-cancelled
        // regular session for this period, any section/round) — backs the
        // per-checkpoint "Period" columns on Evaluation Ratings, which
        // mirror FAITH's own rubric sheet layout (one column per slot,
        // showing the count of mentee attendees per the client's rubric).
        public string? SlotAttendance    { get; set; }
        public double  ProgressPercent   { get; set; }
        // Overall % = Timeliness x 25% + Completeness x 25% + Evaluation
        // Rating x 50% — replaces ProgressPercent (kept above as the raw
        // "sessions completed" stat) as the actual ranking basis.
        public double?  TimelinessPercent       { get; set; }
        public bool     TimelinessPending       { get; set; }
        public int      LateReportCount         { get; set; }
        public int      MissingReportCount      { get; set; }
        public double   CompletenessPercent     { get; set; }
        public decimal? EvaluationRatingPercent { get; set; }
        public double?  OverallPercent          { get; set; }
        public string  ProgressStatus    { get; set; } = "Critical";
        public DateTime? LastSessionDate { get; set; }
        public DateTime? NextSessionDate { get; set; }
    }

    public class MentorSectionProgressDto
    {
        public int CompleteCount { get; set; }
        public int OnTimeCount { get; set; }
        public int MentorID { get; set; }
        public string? CourseSchool { get; set; }
        public string? GroupingMode { get; set; }
        public string SectionCode { get; set; } = string.Empty;
        public int CompletedSessions { get; set; }
        public int RequiredSessions { get; set; }
        public bool IsCurrentlyHandled { get; set; }
        // Checkpoints this course has completed; null for legacy section groups.
        public List<string>? CompletedSlots { get; set; }
    }

    public class MentorDetailDto
    {
        public int     MentorID          { get; set; }
        public string  FirstName         { get; set; } = string.Empty;
        public string  LastName          { get; set; } = string.Empty;
        public string  Email             { get; set; } = string.Empty;
        public string? ContactNumber     { get; set; }
        public string? School            { get; set; }
        public string? DepartmentName    { get; set; }
        public string? Sections          { get; set; }
        public int     CompletedSessions { get; set; }
        public int     RequiredSessions  { get; set; }
        public double  ProgressPercent   { get; set; }
        public double?  TimelinessPercent       { get; set; }
        public bool     TimelinessPending       { get; set; }
        public int      LateReportCount         { get; set; }
        public int      MissingReportCount      { get; set; }
        public double   CompletenessPercent     { get; set; }
        public decimal? EvaluationRatingPercent { get; set; }
        public double?  OverallPercent          { get; set; }
        public string  ProgressStatus    { get; set; } = "Critical";
        public double  AverageAttendance { get; set; }
        public int     ActiveMentees     { get; set; }
        public int     InactiveMentees   { get; set; }
        public List<SessionDetailDto> Sessions { get; set; } = new();
        public List<MenteeDetailDto>  Mentees  { get; set; } = new();
    }

    public class SessionDetailDto
    {
        public int     SessionID            { get; set; }
        public string? Topic                { get; set; }
        public string  Status               { get; set; } = string.Empty;
        public DateTime? SessionDate        { get; set; }
        public string? Notes                { get; set; }
        public string? SlotName             { get; set; }
        public string? LogStatus            { get; set; }
        public DateTime? SubmittedAt        { get; set; }
        public double  AttendancePercentage { get; set; }
        public int     PresentCount         { get; set; }
        public int     TotalMentees         { get; set; }
        public bool    HasProof             { get; set; }
        public string? ProofFilePath        { get; set; }
        // sp_GetMentorDetail's RS3 now returns full session history (not
        // just the current period) -- these let the frontend group/filter
        // by period instead of everything being silently "now only".
        public string? SchoolYear           { get; set; }
        public string? Semester             { get; set; }
    }

    public class MenteeDetailDto
    {
        public int     MenteeID          { get; set; }
        public string  FirstName         { get; set; } = string.Empty;
        public string  LastName          { get; set; } = string.Empty;
        public string? StudentNumber     { get; set; }
        public string? Email             { get; set; }
        public string? Course            { get; set; }
        public string? YearLevel         { get; set; }
        public string? SectionCode       { get; set; }
        public bool    IsDropOut         { get; set; }
        public int     SessionsAttended  { get; set; }
        public int     TotalCompleted    { get; set; }
        public int     TotalSessions     { get; set; }
        public string? SignatureFilePath { get; set; }
        public DateTime? LastAttended   { get; set; }
        public string  Status           { get; set; } = string.Empty;
    }
}
