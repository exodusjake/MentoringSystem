using Dapper;
using Microsoft.Data.SqlClient;
using System.Data;
namespace AstraMentoring_Backend.Services;

public static class CheckpointWindowPolicy
{
    public static int RequiredCheckpointCount(string? semester) => semester == "2nd Semester" ? 5 : 6;
    public const string Error = "This checkpoint is closed, has no session schedule, or the selected date is outside its session window. Refresh the calendar and choose an available checkpoint.";
    public const string WindowSql = """
        SELECT COUNT(*) FROM CalendarEvents WITH (HOLDLOCK)
        WHERE IsPublished=1 AND EventType='Session Schedule' AND SlotName=@SlotName
          AND (SlotName<>'Mentoring Assembly' OR Semester<>'2nd Semester')
          AND SchoolYear=COALESCE(@SchoolYear,(SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear'))
          AND Semester=COALESCE(@Semester,(SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester'))
          AND CAST(@Date AS date) BETWEEN CAST(StartDate AS date) AND CAST(COALESCE(EndDate,StartDate) AS date)
          AND CAST(DATEADD(HOUR,8,SYSUTCDATETIME()) AS date)<=CAST(COALESCE(EndDate,StartDate) AS date)
        """;
    public static async Task<bool> CanScheduleAsync(SqlConnection conn, string? slotName, string? schoolYear, string? semester, DateTime date, IDbTransaction? tx=null)
        => date.Date >= DateTime.UtcNow.AddHours(8).Date && await conn.ExecuteScalarAsync<int>(WindowSql,
            new { SlotName=slotName, SchoolYear=schoolYear, Semester=semester, Date=date },tx)>0;

    public static async Task<bool> CanAttendAsync(SqlConnection conn, int sessionId, IDbTransaction? tx=null)
        => await conn.ExecuteScalarAsync<int>("""
            SELECT COUNT(*) FROM Sessions s WITH (HOLDLOCK)
            WHERE s.SessionID=@sessionId AND s.Status<>'Cancelled' AND s.TimeEnd IS NULL
              AND (s.SlotName<>'Mentoring Assembly' OR s.Semester<>'2nd Semester')
              AND EXISTS(SELECT 1 FROM CalendarEvents e WITH (HOLDLOCK)
                WHERE e.IsPublished=1 AND e.EventType='Session Schedule' AND e.SlotName=s.SlotName
                  AND e.SchoolYear=s.SchoolYear AND e.Semester=s.Semester
                  AND CAST(s.SessionDate AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date)
                  AND CAST(DATEADD(HOUR,8,SYSUTCDATETIME()) AS date) BETWEEN CAST(e.StartDate AS date) AND CAST(COALESCE(e.EndDate,e.StartDate) AS date))
            """,new { sessionId },tx)>0;
}
