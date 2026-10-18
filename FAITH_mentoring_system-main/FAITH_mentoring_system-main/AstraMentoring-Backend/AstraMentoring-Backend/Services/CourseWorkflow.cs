using Dapper;
using Microsoft.Data.SqlClient;
namespace AstraMentoring_Backend.Services;

public static class CourseWorkflow
{
    // Remove only empty current-assignment placeholders during adoption. Real
    // legacy sessions and CheckpointLogs stay separate and are never merged.
    public static async Task<string[]> EmptyLegacyGroupsAsync(SqlConnection conn,int mentorId,string year,string semester,CourseGroup course)
        => (await conn.QueryAsync<string>("""
            SELECT DISTINCT COALESCE(sec.SectionCode,mp.Section) FROM MentorMentee mm
            JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
            WHERE mm.MentorID=@mentorId AND mm.IsActive=1 AND mp.School=@School AND UPPER(REPLACE(mp.Course,' ',''))=UPPER(REPLACE(@CourseCode,' ',''))
              AND NULLIF(COALESCE(sec.SectionCode,mp.Section),'') IS NOT NULL
              AND NOT EXISTS(SELECT 1 FROM CheckpointLogs logs WHERE logs.MentorID=@mentorId AND logs.SchoolYear=@year AND logs.Semester=@semester AND logs.SectionCode=COALESCE(sec.SectionCode,mp.Section))
              AND NOT EXISTS(SELECT 1 FROM Sessions s WHERE s.MentorID=@mentorId AND s.SchoolYear=@year AND s.Semester=@semester
                  AND NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                  AND (s.SectionCode=COALESCE(sec.SectionCode,mp.Section) OR EXISTS(SELECT 1 FROM Attendance a WHERE a.SessionID=s.SessionID AND a.MenteeID=mp.UserID)))
            """,new {mentorId,year,semester,course.School,course.CourseCode})).ToArray();
    public const string CreditedAttendanceSql="""
        SELECT DISTINCT s.MentorID,a.MenteeID,s.SlotName FROM Sessions s
        JOIN Attendance a ON a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
        JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.MenteeID=a.MenteeID AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
        LEFT JOIN MenteeProfiles mp ON mp.UserID=a.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
        WHERE s.MentorID IN @MentorIds AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
          AND ISNULL(mp.IsDropOut,0)=0 AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
          AND (EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=a.MenteeID)
            OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                AND (s.RequestID IS NOT NULL OR s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section))))
          AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1
            AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
            AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
            AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        """;
    public const string ExpectedAttendanceSql="""
        SELECT s.MentorID,mm.MenteeID,s.SlotName,
            MAX(CASE WHEN a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND scanWindow.Events>0 THEN 1 ELSE 0 END) Attended
        FROM Sessions s JOIN MentorMentee mm ON mm.MentorID=s.MentorID AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
        JOIN MenteeProfiles mp ON mp.UserID=mm.MenteeID LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
        LEFT JOIN Attendance a ON a.SessionID=s.SessionID AND a.MenteeID=mm.MenteeID
        OUTER APPLY(SELECT COUNT(*) Events FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
          AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
          AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)) scanWindow
        WHERE s.MentorID IN @MentorIds AND s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
          AND ISNULL(mp.IsDropOut,0)=0 AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
          AND (EXISTS(SELECT 1 FROM SessionCourseMembers cm WHERE cm.SessionID=s.SessionID AND cm.MenteeID=mm.MenteeID)
             OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID) AND
               ((s.RequestID IS NULL AND (s.SectionCode IS NULL OR s.SectionCode=COALESCE(sec.SectionCode,mp.Section)))
                OR (s.RequestID IS NOT NULL AND (a.IsPresent=1 OR EXISTS(SELECT 1 FROM SessionRequests sr WHERE sr.RequestID=s.RequestID AND sr.MenteeID=mm.MenteeID AND sr.Status='Approved'))))))
          AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
            AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        GROUP BY s.MentorID,mm.MenteeID,s.SlotName
        """;
    // Same rows with drop-out mentees kept, for a mentee's own attendance card.
    public static readonly string ExpectedAttendanceWithDropOutsSql=
        ExpectedAttendanceSql.Replace("AND ISNULL(mp.IsDropOut,0)=0 AND (s.Semester","AND (s.Semester");
    // Attendance Logs rows per (current mentor, active mentee, checkpoint). A checkpoint counts
    // as attended once for the mentee when they have a valid scan at any session of it,
    // including one held by a previous mentor.
    public static readonly string MenteeCheckpointAttendanceSql=$"""
        WITH Expected AS (
        {ExpectedAttendanceWithDropOutsSql}
        ), Credit AS (
            SELECT DISTINCT a.MenteeID,s.SlotName FROM Sessions s
            JOIN Attendance a ON a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL
            WHERE s.SchoolYear=@SchoolYear AND s.Semester=@Semester AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
              AND s.SlotName IS NOT NULL AND (s.Semester<>'2nd Semester' OR s.SlotName<>'Mentoring Assembly')
              AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1
                AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
        ), MenteeRows AS (
            SELECT e.MentorID,e.MenteeID,e.SlotName,
                CASE WHEN e.Attended=1 OR EXISTS(SELECT 1 FROM Credit c WHERE c.MenteeID=e.MenteeID AND c.SlotName=e.SlotName) THEN 1 ELSE 0 END Attended
            FROM Expected e
            UNION ALL
            SELECT mm.MentorID,mm.MenteeID,c.SlotName,1
            FROM MentorMentee mm JOIN Credit c ON c.MenteeID=mm.MenteeID
            WHERE mm.MentorID IN @MentorIds AND mm.IsActive=1
              AND NOT EXISTS(SELECT 1 FROM Expected e WHERE e.MentorID=mm.MentorID AND e.MenteeID=mm.MenteeID AND e.SlotName=c.SlotName)
        )
        SELECT r.MentorID,r.MenteeID,r.SlotName,r.Attended FROM MenteeRows r
        JOIN Users u ON u.UserID=r.MenteeID AND u.IsActive=1
        """;
    public static async Task<List<CheckpointReportStatusDto>> ReportsAsync(SqlConnection conn,int mentorId,string year,string semester)
    {
        if(await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE s.MentorID=@mentorId AND s.SchoolYear=@year AND s.Semester=@semester",new {mentorId,year,semester})==0)return new();
        var current=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SystemSettings WHERE (SettingKey='SchoolYear' AND SettingValue=@year) OR (SettingKey='Semester' AND SettingValue=@semester)",new {year,semester})==2;
        var groups=current?await CoursePolicy.AssignedAsync(conn,mentorId):new List<CourseGroup>();
        groups.AddRange(await conn.QueryAsync<CourseGroup>("SELECT DISTINCT c.School,c.CourseCode FROM SessionCourseScopes c JOIN Sessions s ON s.SessionID=c.SessionID WHERE s.MentorID=@mentorId AND s.SchoolYear=@year AND s.Semester=@semester",new {mentorId,year,semester}));
        var result=new List<CheckpointReportStatusDto>();
        foreach(var course in groups.Distinct())foreach(var slot in AstraMentoring_Backend.Constants.MentoringSlots.ForSemester(semester))
        {
            var parameters=new {mentorId,year,semester,slot,course.School,course.CourseCode};
            var row=await conn.QuerySingleAsync<CheckpointReportStatusDto>("""
                SELECT @CourseCode SectionCode,@School CourseSchool,@year SchoolYear,@semester Semester,@slot SlotName,
                    logs.LogStatus,ISNULL(logs.NeedsUpdate,0) NeedsUpdate,
                    TODATETIMEOFFSET(logs.SubmittedAt,'+00:00') SubmittedAt,
                    CAST(CASE WHEN logs.LogStatus='Submitted' AND ISNULL(logs.NeedsUpdate,0)=0 AND done.Completed>0 AND done.Unfinished=0 AND done.HasProof>0 AND EXISTS(SELECT 1 FROM MentorProfiles mp WHERE mp.UserID=@mentorId AND NULLIF(LTRIM(RTRIM(mp.SignatureFilePath)),'') IS NOT NULL) THEN 1 ELSE 0 END AS bit) DocumentsComplete,
                    CASE WHEN deadline.Events=1 THEN TODATETIMEOFFSET(CAST(DATEADD(DAY,1,CAST(deadline.DeadlineDate AS date)) AS datetime2),'+08:00') END DeadlineExclusive
                FROM (SELECT 1 AS dummy) seed
                LEFT JOIN CourseCheckpointLogs logs ON logs.MentorID=@mentorId AND logs.SchoolYear=@year AND logs.Semester=@semester AND logs.SlotName=@slot AND logs.School=@School AND logs.CourseCode=@CourseCode
                OUTER APPLY(SELECT COUNT(*) Events,MAX(StartDate) DeadlineDate FROM CalendarEvents WHERE SchoolYear=@year AND Semester=@semester AND SlotName=@slot AND IsPublished=1 AND EventType='Deadline') deadline
                OUTER APPLY(SELECT SUM(CASE WHEN s.Status='Completed' AND s.TimeEnd IS NOT NULL THEN 1 ELSE 0 END) Completed,
                                  SUM(CASE WHEN s.TimeEnd IS NULL THEN 1 ELSE 0 END) Unfinished,
                                  SUM(CASE WHEN proof.ProofCount>0 THEN 1 ELSE 0 END) HasProof
                            FROM Sessions s JOIN SessionCourseScopes c ON c.SessionID=s.SessionID AND c.School=@School AND c.CourseCode=@CourseCode
                            OUTER APPLY(SELECT COUNT(*) ProofCount FROM ProofOfSession p WHERE p.SessionID=s.SessionID AND NULLIF(p.FilePath,'') IS NOT NULL) proof
                            WHERE s.MentorID=@mentorId AND s.SchoolYear=@year AND s.Semester=@semester AND s.SlotName=@slot AND s.Status<>'Cancelled'
                              AND EXISTS(SELECT 1 FROM Attendance a JOIN SessionCourseMembers m ON m.SessionID=a.SessionID AND m.MenteeID=a.MenteeID
                                         WHERE a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND m.School=@School AND m.CourseCode=@CourseCode
                      AND EXISTS(SELECT 1 FROM CalendarEvents w WHERE w.EventType='Session Schedule' AND w.IsPublished=1 AND w.SchoolYear=s.SchoolYear AND w.Semester=s.Semester AND w.SlotName=s.SlotName AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(w.StartDate AS date) AND CAST(COALESCE(w.EndDate,w.StartDate) AS date)))
                              AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName
                                  AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))) done
                """,parameters);
            row.Status=CheckpointReportStatusPolicy.Classify(row.NeedsUpdate,row.LogStatus,row.DocumentsComplete,row.SubmittedAt,row.DeadlineExclusive,DateTimeOffset.UtcNow);
            result.Add(row);
        }
        return result;
    }

    public static async Task ApplyProgressAsync(SqlConnection conn,int mentorId,string year,string semester,List<MentorSectionProgressDto> progress,List<CheckpointReportStatusDto>? cachedReports=null)
    {
        var reports=cachedReports??await ReportsAsync(conn,mentorId,year,semester);if(reports.Count==0)return;
        progress.RemoveAll(p=>string.IsNullOrWhiteSpace(p.SectionCode));
        var current=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM SystemSettings WHERE (SettingKey='SchoolYear' AND SettingValue=@year) OR (SettingKey='Semester' AND SettingValue=@semester)",new {year,semester})==2;
        var assigned=current?await CoursePolicy.AssignedAsync(conn,mentorId):new List<CourseGroup>();
        foreach(var group in reports.GroupBy(r=>new {r.CourseSchool,r.SectionCode}))
        {
            var emptyLegacy=await EmptyLegacyGroupsAsync(conn,mentorId,year,semester,new CourseGroup(group.Key.CourseSchool!,group.Key.SectionCode));
            progress.RemoveAll(p=>p.GroupingMode!="Course"&&emptyLegacy.Contains(p.SectionCode));
            // An existing nonempty legacy group is left unchanged for review;
            // never automatically merge historical section groups into courses.
            var legacy=await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Sessions s WHERE s.MentorID=@mentorId AND s.SchoolYear=@year AND s.Semester=@semester AND s.SectionCode=@CourseCode AND NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)",new {mentorId,year,semester,CourseCode=group.Key.SectionCode});
            if(legacy==0)progress.RemoveAll(p=>p.SectionCode==group.Key.SectionCode&&p.GroupingMode!="Course");
            var completedSlots=(await conn.QueryAsync<string>("""
                SELECT DISTINCT s.SlotName FROM Sessions s JOIN SessionCourseScopes c ON c.SessionID=s.SessionID
                WHERE s.MentorID=@mentorId AND s.SchoolYear=@year AND s.Semester=@semester AND c.School=@School AND c.CourseCode=@CourseCode
                  AND s.Status='Completed' AND s.TimeEnd IS NOT NULL
                  AND EXISTS(SELECT 1 FROM Attendance a JOIN SessionCourseMembers m ON m.SessionID=a.SessionID AND m.MenteeID=a.MenteeID WHERE a.SessionID=s.SessionID AND a.IsPresent=1 AND a.ScannedAt IS NOT NULL AND m.School=@School AND m.CourseCode=@CourseCode
                      AND EXISTS(SELECT 1 FROM CalendarEvents w WHERE w.EventType='Session Schedule' AND w.IsPublished=1 AND w.SchoolYear=s.SchoolYear AND w.Semester=s.Semester AND w.SlotName=s.SlotName AND CAST(DATEADD(HOUR,8,a.ScannedAt) AS date) BETWEEN CAST(w.StartDate AS date) AND CAST(COALESCE(w.EndDate,w.StartDate) AS date)))
                  AND EXISTS(SELECT 1 FROM CalendarEvents e WHERE e.EventType='Session Schedule' AND e.IsPublished=1 AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester AND e.SlotName=s.SlotName AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
                """,new {mentorId,year,semester,School=group.Key.CourseSchool,CourseCode=group.Key.SectionCode})).ToList();
            progress.Add(new MentorSectionProgressDto {MentorID=mentorId,SectionCode=group.Key.SectionCode,CourseSchool=group.Key.CourseSchool,GroupingMode="Course",RequiredSessions=group.Count(),CompletedSessions=completedSlots.Count,CompletedSlots=completedSlots,CompleteCount=group.Count(r=>r.DocumentsComplete),OnTimeCount=group.Count(r=>r.DocumentsComplete&&r.DeadlineExclusive.HasValue&&r.SubmittedAt<r.DeadlineExclusive),IsCurrentlyHandled=assigned.Contains(new CourseGroup(group.Key.CourseSchool!,group.Key.SectionCode))});
        }
    }
    public static async Task AppendLogsheetsAsync(SqlConnection conn,SessionsAdminService service,int mentorId,List<LogsheetSessionDto> sessions)
    {
        var native=(await conn.QueryAsync<LogsheetSessionDto>("""
            SELECT s.SessionID,s.SlotName,s.SessionDate,CAST(s.SessionDate AS time) TimeStart,s.TimeEnd,
                s.Notes AS Topic,s.Status AS SessionStatus,s.SchoolYear,s.Semester,s.LogStatus,s.SubmittedAt,
                'Course' AS GroupingMode,CAST(CASE WHEN s.RequestID IS NULL THEN 0 ELSE 1 END AS bit) IsMakeup,
                p.FilePath AS ProofFilePath,p.FileType AS ProofFileType
            FROM Sessions s OUTER APPLY(SELECT TOP (1) FilePath,FileType FROM ProofOfSession WHERE SessionID=s.SessionID ORDER BY UploadedAt DESC) p
            WHERE s.MentorID=@mentorId AND EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
            """,new {mentorId})).ToList();
        var states=(await conn.QueryAsync<CheckpointLogStateDto>("SELECT SchoolYear,Semester,SlotName,School AS CourseSchool,CourseCode AS SectionCode,LogStatus,SubmittedAt,NeedsUpdate FROM CourseCheckpointLogs WHERE MentorID=@mentorId",new {mentorId})).ToList();
        // This new write path explicitly uses SYSUTCDATETIME. Emit Z for it;
        // do not reinterpret timestamps in historical CheckpointLogs.
        foreach(var state in states)
            if(state.SubmittedAt.HasValue)state.SubmittedAt=DateTime.SpecifyKind(state.SubmittedAt.Value,DateTimeKind.Utc);
        foreach(var row in native)
        {
            var scopes=(await conn.QueryAsync<CourseGroup>("SELECT School,CourseCode FROM SessionCourseScopes WHERE SessionID=@SessionID",new {row.SessionID})).ToArray();
            if(!row.IsMakeup){row.CourseSchool=scopes[0].School;row.CourseCode=scopes[0].CourseCode;row.SessionSectionCode=scopes[0].CourseCode;row.Sections=scopes[0].CourseCode;}
            var roster=row.IsMakeup?await service.GetMakeupSessionRequesterAsync(row.SessionID):await service.GetSessionMenteesAsync(row.SessionID);
            var snapshots=(await conn.QueryAsync<(int MenteeID,string School,string CourseCode)>("SELECT MenteeID,School,CourseCode FROM SessionCourseMembers WHERE SessionID=@SessionID",new {row.SessionID})).ToDictionary(x=>x.MenteeID);
            row.Mentees=roster.Select(m=>{
                var snapshot=snapshots.GetValueOrDefault(m.MenteeID);
                return new LogsheetMenteeDto {AttendanceID=m.AttendanceID,MenteeID=m.MenteeID,MenteeName=$"{m.MenteeFirstName} {m.MenteeLastName}".Trim(),
                    Course=snapshot.CourseCode??row.CourseCode??m.Course,CourseSchool=snapshot.School??row.CourseSchool??m.CourseSchool,
                    SectionCode=snapshot.CourseCode??row.CourseCode??m.Course,IsPresent=m.IsPresent??false,ScannedAt=m.ScannedAt,
                    Remarks=m.Remarks,MentorNotes=m.MentorNotes,AbsenceReason=m.AbsenceReason,SignatureFilePath=m.SignatureFilePath,IsDropOut=m.IsDropOut};
            }).ToList();
            row.CheckpointStates=states.Where(s=>s.SchoolYear==row.SchoolYear&&s.Semester==row.Semester&&s.SlotName==row.SlotName).ToList();
            if(row.IsMakeup)row.LogStatus=row.CheckpointStates.Any(s=>s.LogStatus=="Submitted")?"Submitted":"Draft";
            if(!row.IsMakeup)
            {
                var state=row.CheckpointStates.FirstOrDefault(s=>s.CourseSchool==row.CourseSchool&&s.SectionCode==row.CourseCode);
                row.LogStatus=state?.LogStatus??"Draft";row.SubmittedAt=state?.SubmittedAt;
            }
            sessions.RemoveAll(s=>s.SessionID==row.SessionID);sessions.Add(row);
        }
    }
}
