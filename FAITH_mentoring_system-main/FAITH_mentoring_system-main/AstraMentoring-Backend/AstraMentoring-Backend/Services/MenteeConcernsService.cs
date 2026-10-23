using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    // A mentor flags a mentee with a written concern. It stays Open (red on the mentor's mentee card and in the
    // Admin/Head bell) until an Admin or Head Admin responds; the mentor is then notified and sees the response.
    public class MenteeConcernsService
    {
        public static readonly string[] Categories =
            { "Attendance", "Academic performance", "Behavior or conduct", "Personal or welfare", "Safety", "Other" };
        public const int MinMessageLength = 10;
        public const int MaxMessageLength = 1000;
        public const int MinResponseLength = 2;
        public const int MaxResponseLength = 1000;
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

        private const string SelectConcern = @"
            SELECT c.ConcernID, c.MentorID, c.MenteeID, c.Category, c.Message, c.CreatedAt, c.Status,
                   c.ResponseMessage, c.RespondedAt,
                   LTRIM(RTRIM(mu.FirstName + ' ' + mu.LastName)) AS MentorName,
                   LTRIM(RTRIM(eu.FirstName + ' ' + eu.LastName)) AS MenteeName,
                   mp.Course,
                   LTRIM(RTRIM(ru.FirstName + ' ' + ru.LastName)) AS ResponderName,
                   ru.Role AS ResponderRole,
                   CAST(CASE WHEN c.MentorSeenResponseAt IS NULL THEN 0 ELSE 1 END AS bit) AS MentorSeen
            FROM MenteeConcerns c
            JOIN Users mu ON mu.UserID = c.MentorID
            JOIN Users eu ON eu.UserID = c.MenteeID
            LEFT JOIN MenteeProfiles mp ON mp.UserID = c.MenteeID
            LEFT JOIN Users ru ON ru.UserID = c.RespondedByUserID";

        // Admin/Head bell: concerns still waiting for a response come first (they stay red until someone responds),
        // then the answered ones, newest first within each.
        public async Task<ConcernFeed> GetStaffFeedAsync(int top = 50)
        {
            using var conn = new SqlConnection(_connectionString);
            var items = (await conn.QueryAsync<ConcernItem>(
                $"SELECT TOP (@top) * FROM ({SelectConcern}) x ORDER BY CASE WHEN x.Status = 'Open' THEN 0 ELSE 1 END, x.CreatedAt DESC, x.ConcernID DESC",
                new { top })).ToList();
            var open = await conn.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM MenteeConcerns WHERE Status = 'Open'");
            return new ConcernFeed { Count = open, Items = items };
        }

        // Mentor: their own concerns, plus how many responses they have not opened yet.
        public async Task<ConcernFeed> GetMineAsync(int mentorId, int top = 100)
        {
            using var conn = new SqlConnection(_connectionString);
            var items = (await conn.QueryAsync<ConcernItem>(
                $"SELECT TOP (@top) * FROM ({SelectConcern}) x WHERE x.MentorID = @mentorId ORDER BY x.CreatedAt DESC, x.ConcernID DESC",
                new { top, mentorId })).ToList();
            var unseen = await conn.ExecuteScalarAsync<int>(
                "SELECT COUNT(1) FROM MenteeConcerns WHERE MentorID=@mentorId AND Status='Responded' AND MentorSeenResponseAt IS NULL",
                new { mentorId });
            return new ConcernFeed { Count = unseen, Items = items };
        }

        public enum RespondStatus { Ok, InvalidMessage, NotFound, AlreadyResponded }
        public record RespondResult(RespondStatus Status, ConcernItem? Item = null);

        // The first Admin/Head to respond closes the concern for everyone.
        public async Task<RespondResult> RespondAsync(int responderId, int concernId, string? message)
        {
            message = message?.Trim();
            if (string.IsNullOrEmpty(message) || message.Length < MinResponseLength || message.Length > MaxResponseLength)
                return new RespondResult(RespondStatus.InvalidMessage);

            using var conn = new SqlConnection(_connectionString);
            var updated = await conn.ExecuteAsync(
                "UPDATE MenteeConcerns SET Status='Responded', ResponseMessage=@message, RespondedByUserID=@responderId, RespondedAt=SYSDATETIMEOFFSET() WHERE ConcernID=@concernId AND Status='Open'",
                new { message, responderId, concernId });
            var item = await conn.QueryFirstOrDefaultAsync<ConcernItem>($"{SelectConcern} WHERE c.ConcernID = @concernId", new { concernId });
            if (item == null) return new RespondResult(RespondStatus.NotFound);
            return updated == 0 ? new RespondResult(RespondStatus.AlreadyResponded, item) : new RespondResult(RespondStatus.Ok, item);
        }

        // The mentor opened the response: the notification and the green mark on the mentee card clear.
        public async Task<bool> AcknowledgeAsync(int mentorId, int concernId)
        {
            using var conn = new SqlConnection(_connectionString);
            var owns = await conn.ExecuteScalarAsync<int>("SELECT COUNT(1) FROM MenteeConcerns WHERE ConcernID=@concernId AND MentorID=@mentorId", new { concernId, mentorId });
            if (owns == 0) return false;
            await conn.ExecuteAsync(
                "UPDATE MenteeConcerns SET MentorSeenResponseAt=SYSDATETIMEOFFSET() WHERE ConcernID=@concernId AND MentorID=@mentorId AND Status='Responded' AND MentorSeenResponseAt IS NULL",
                new { concernId, mentorId });
            return true;
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
        public string Status { get; set; } = "Open";
        public string? ResponseMessage { get; set; }
        public DateTimeOffset? RespondedAt { get; set; }
        public string? ResponderName { get; set; }
        public string? ResponderRole { get; set; }
        public bool MentorSeen { get; set; }
    }

    // Count = concerns still awaiting a response (Admin/Head) or responses the mentor has not opened (Mentor).
    public class ConcernFeed
    {
        public int Count { get; set; }
        public List<ConcernItem> Items { get; set; } = new();
    }
}
