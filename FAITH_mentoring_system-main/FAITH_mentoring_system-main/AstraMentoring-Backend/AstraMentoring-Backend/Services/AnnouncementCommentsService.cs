using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class CommentWithUserDto
    {
        public int CommentID { get; set; }
        public int AnnouncementID { get; set; }
        public int PostedByUserID { get; set; }
        public string Content { get; set; } = string.Empty;
        public DateTime PostedAt { get; set; }
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
    }

    public class AnnouncementCommentsService
    {
        private readonly IGenericRepository<AnnouncementComment> _repo;
        private readonly string _connectionString;

        public AnnouncementCommentsService(IGenericRepository<AnnouncementComment> repo, IConfiguration configuration)
        {
            _repo = repo;
            _connectionString = configuration.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<CommentWithUserDto>> GetByAnnouncementId(int announcementId)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<CommentWithUserDto>(
                "SELECT * FROM vw_AnnouncementCommentsWithUser WHERE AnnouncementID = @id ORDER BY PostedAt ASC",
                new { id = announcementId });
            // Same DateTimeKind fix as AnnouncementsService.GetAllWithPoster
            // — SQL Server's datetime2 loses timezone info on the way out,
            // so mark it Utc explicitly or the frontend misreads this UTC
            // clock reading as already being the viewer's local time.
            foreach (var row in rows)
                row.PostedAt = DateTime.SpecifyKind(row.PostedAt, DateTimeKind.Utc);
            return rows;
        }

        public async Task<DateTime?> GetLatestCommentDateForAnnouncer(int announcerUserId)
        {
            using var conn = new SqlConnection(_connectionString);
            var date = await conn.ExecuteScalarAsync<DateTime?>(@"
                SELECT MAX(c.PostedAt)
                FROM AnnouncementComments c
                JOIN Announcements a ON a.AnnouncementID = c.AnnouncementID
                WHERE a.PostedByUserID = @userId
                  AND c.PostedByUserID != @userId",
                new { userId = announcerUserId });
            // Same DateTimeKind fix — the sidebar's "new comment" badge
            // compares this against a locally-stored last-seen timestamp,
            // so an unmarked Kind here would make that comparison wrong by
            // the same 8 hours as the display bug, not just look wrong.
            return date.HasValue ? DateTime.SpecifyKind(date.Value, DateTimeKind.Utc) : date;
        }

        public async Task<DateTime?> GetLatestMentionDateAsync(int userId)
        {
            using var conn = new SqlConnection(_connectionString);

            var firstName = await conn.ExecuteScalarAsync<string>(
                "SELECT FirstName FROM Users WHERE UserID = @userId",
                new { userId });

            if (string.IsNullOrEmpty(firstName)) return null;

            // Escape LIKE special characters so they are treated as literals
            var safeName = firstName
                .Replace("[", "[[]")
                .Replace("%", "[%]")
                .Replace("_", "[_]");

            var date = await conn.ExecuteScalarAsync<DateTime?>(@"
                SELECT MAX(c.PostedAt)
                FROM AnnouncementComments c
                WHERE c.Content LIKE @pattern
                  AND c.PostedByUserID != @userId",
                new { pattern = $"%@{safeName}%", userId });
            // Same DateTimeKind fix as GetLatestCommentDateForAnnouncer above.
            return date.HasValue ? DateTime.SpecifyKind(date.Value, DateTimeKind.Utc) : date;
        }

        public async Task<bool> Add(AnnouncementComment data) => await _repo.AddAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);

        // Ownership check backing the controller's edit/delete guard.
        public async Task<int?> GetPosterIdAsync(int commentId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int?>(
                "SELECT PostedByUserID FROM AnnouncementComments WHERE CommentID = @Id",
                new { Id = commentId });
        }

        public async Task<bool> UpdateContent(int commentId, string content)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE AnnouncementComments SET Content = @content WHERE CommentID = @id",
                new { content, id = commentId });
            return rows > 0;
        }
    }
}
