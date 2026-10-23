using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    // A mentor flags a mentee with a written concern; every Admin and Head Admin sees it in the bell at the top
    // right of their portal. Read state is per Admin/Head user (MenteeConcernReads: no row = unread).
    public class MenteeConcernsService
    {
        public static readonly string[] Categories =
            { "Attendance", "Academic performance", "Behavior or conduct", "Personal or welfare", "Safety", "Other" };
        public const int MinMessageLength = 10;
        public const int MaxMessageLength = 1000;
        // Stops a double-click from sending the same concern twice.
        private const int DuplicateWindowSeconds = 30;

        private readonly string _connectionString;

        public MenteeConcernsService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public enum SubmitStatus { Ok, InvalidCategory, InvalidMessage, NotAssigned, TooSoon }
        public record SubmitResult(SubmitStatus Status, int ConcernId = 0);

        public async Task<SubmitResult> SubmitAsync(int mentorId, int menteeId, string? category, string? message)
        {
            category = category?.Trim();
            message = message?.Trim();
            if (category == null || !Categories.Contains(category)) return new SubmitResult(SubmitStatus.InvalidCategory);
            if (string.IsNullOrEmpty(message) || message.Length < MinMessageLength || message.Length > MaxMessageLength)
                return new SubmitResult(SubmitStatus.InvalidMessage);

            using var conn = new SqlConnection(_connectionString);
            // A mentor can only flag a mentee who is actively assigned to them.
            var assigned = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM MentorMentee WHERE MentorID=@mentorId AND MenteeID=@menteeId AND IsActive=1",
                new { mentorId, menteeId });
            if (assigned == 0) return new SubmitResult(SubmitStatus.NotAssigned);

            var recent = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM MenteeConcerns WHERE MentorID=@mentorId AND MenteeID=@menteeId AND CreatedAt > DATEADD(SECOND, -@seconds, SYSDATETIMEOFFSET())",
                new { mentorId, menteeId, seconds = DuplicateWindowSeconds });
            if (recent > 0) return new SubmitResult(SubmitStatus.TooSoon);

            var id = await conn.ExecuteScalarAsync<int>(
                "INSERT INTO MenteeConcerns (MentorID, MenteeID, Category, Message) OUTPUT INSERTED.ConcernID VALUES (@mentorId, @menteeId, @category, @message)",
                new { mentorId, menteeId, category, message });
            return new SubmitResult(SubmitStatus.Ok, id);
        }

        // Newest concerns first, with whether THIS user has opened each one, plus how many are still unread.
        public async Task<ConcernFeed> GetFeedAsync(int userId, int top = 50)
        {
            using var conn = new SqlConnection(_connectionString);
            var items = (await conn.QueryAsync<ConcernItem>(@"
                SELECT TOP (@top) c.ConcernID, c.MentorID, c.MenteeID, c.Category, c.Message, c.CreatedAt,
                       LTRIM(RTRIM(mu.FirstName + ' ' + mu.LastName)) AS MentorName,
                       LTRIM(RTRIM(eu.FirstName + ' ' + eu.LastName)) AS MenteeName,
                       mp.Course,
                       CAST(CASE WHEN r.UserID IS NULL THEN 0 ELSE 1 END AS bit) AS IsRead
                FROM MenteeConcerns c
                JOIN Users mu ON mu.UserID = c.MentorID
                JOIN Users eu ON eu.UserID = c.MenteeID
                LEFT JOIN MenteeProfiles mp ON mp.UserID = c.MenteeID
                LEFT JOIN MenteeConcernReads r ON r.ConcernID = c.ConcernID AND r.UserID = @userId
                ORDER BY c.CreatedAt DESC, c.ConcernID DESC",
                new { top, userId })).ToList();
            var unread = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM MenteeConcerns c WHERE NOT EXISTS (SELECT 1 FROM MenteeConcernReads r WHERE r.ConcernID = c.ConcernID AND r.UserID = @userId)",
                new { userId });
            return new ConcernFeed { UnreadCount = unread, Items = items };
        }

        public async Task<bool> MarkReadAsync(int userId, int concernId)
        {
            using var conn = new SqlConnection(_connectionString);
            var exists = await conn.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM MenteeConcerns WHERE ConcernID=@concernId", new { concernId });
            if (exists == 0) return false;
            await conn.ExecuteAsync(
                "IF NOT EXISTS (SELECT 1 FROM MenteeConcernReads WHERE ConcernID=@concernId AND UserID=@userId) INSERT INTO MenteeConcernReads (ConcernID, UserID) VALUES (@concernId, @userId)",
                new { concernId, userId });
            return true;
        }

        public async Task MarkAllReadAsync(int userId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                "INSERT INTO MenteeConcernReads (ConcernID, UserID) SELECT c.ConcernID, @userId FROM MenteeConcerns c WHERE NOT EXISTS (SELECT 1 FROM MenteeConcernReads r WHERE r.ConcernID = c.ConcernID AND r.UserID = @userId)",
                new { userId });
        }
    }

    public class ConcernItem
    {
        public int ConcernID { get; set; }
        public int MentorID { get; set; }
        public string MentorName { get; set; } = "";
        public int MenteeID { get; set; }
        public string MenteeName { get; set; } = "";
        public string? Course { get; set; }
        public string Category { get; set; } = "";
        public string Message { get; set; } = "";
        public DateTimeOffset CreatedAt { get; set; }
        public bool IsRead { get; set; }
    }

    public class ConcernFeed
    {
        public int UnreadCount { get; set; }
        public List<ConcernItem> Items { get; set; } = new();
    }
}
