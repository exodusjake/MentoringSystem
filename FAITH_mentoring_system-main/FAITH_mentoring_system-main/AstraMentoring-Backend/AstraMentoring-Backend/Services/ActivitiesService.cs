using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class ActivitiesService
    {
        private readonly string _connectionString;

        public ActivitiesService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<ActivityDto>> GetRecentActivitiesAsync(int top = 10)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<ActivityRow>(
                "EXEC sp_GetRecentActivities @Top",
                new { Top = top });

            // DB stores UTC but Dapper returns Unspecified — mark it Utc so it serializes with a 'Z'.
            return rows.Select(r => new ActivityDto
            {
                SessionID   = r.SessionID,
                Description = BuildDescription(r.MentorName, r.ActivityType, r.SlotName),
                Date        = DateTime.SpecifyKind(r.ActivityDate, DateTimeKind.Utc),
                Status      = r.ActivityType,
                MenteeCount = r.ActivityType != "Cancelled" && r.MenteeCount > 0 ? r.MenteeCount : null
            });
        }

        private static string BuildDescription(string mentorName, string type, string? slotName)
        {
            // Null for a makeup session or one logged before slots existed
            // (Phase 2) — falls back to the generic phrasing that was
            // already here rather than saying "for null".
            var slotSuffix = !string.IsNullOrWhiteSpace(slotName) ? $" for {slotName}" : "";
            return type?.ToLower() switch
            {
                "completed"      => $"{mentorName} completed a session{slotSuffix}",
                "proof uploaded" => $"{mentorName} uploaded session proof{slotSuffix}",
                "scheduled"      => $"{mentorName} scheduled a session{slotSuffix}",
                "cancelled"      => $"{mentorName}'s session{slotSuffix} was cancelled",
                _                => $"{mentorName} - session activity"
            };
        }

        private class ActivityRow
        {
            public int    SessionID { get; set; }
            public string MentorName { get; set; } = string.Empty;
            public DateTime SessionDate { get; set; }
            public string Status { get; set; } = string.Empty;
            public string? SlotName { get; set; }
            public string ActivityType { get; set; } = string.Empty;
            public DateTime ActivityDate { get; set; }
            public int MenteeCount { get; set; }
        }
    }

    public class ActivityDto
    {
        public int    SessionID { get; set; }
        public string Description { get; set; } = string.Empty;
        public DateTime Date { get; set; }
        public string Status { get; set; } = string.Empty;
        public int? MenteeCount { get; set; }
    }
}
