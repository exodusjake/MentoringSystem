using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class AnnouncementWithPosterDto
    {
        public int      AnnouncementID  { get; set; }
        public int      PostedByUserID  { get; set; }
        public string   Title           { get; set; } = string.Empty;
        public string   Content         { get; set; } = string.Empty;
        public string   TargetAudience  { get; set; } = string.Empty;
        public DateTime PostedAt        { get; set; }
        public bool     IsActive        { get; set; }
        public bool     IsPinned        { get; set; }
        public string   PosterFirstName { get; set; } = string.Empty;
        public string   PosterLastName  { get; set; } = string.Empty;
        public string   PosterRole      { get; set; } = string.Empty;
    }

    public class AnnouncementsService
    {
        private readonly IGenericRepository<Announcement> _repo;
        private readonly string _connectionString;

        public AnnouncementsService(IGenericRepository<Announcement> repo, IConfiguration config)
        {
            _repo = repo;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<AnnouncementWithPosterDto>> GetAllWithPoster()
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<AnnouncementWithPosterDto>(
                "SELECT * FROM vw_AnnouncementsWithPoster ORDER BY IsPinned DESC, PostedAt DESC");
            // SQL Server's datetime2 column has no timezone concept, so
            // Dapper reads PostedAt back as DateTimeKind.Unspecified —
            // serialized to JSON with no 'Z'/offset, which makes the
            // frontend's `new Date(...)` treat this UTC clock reading as
            // if it were already the viewer's own local time (8 hours off
            // for a Philippines-based viewer). Marking it Utc here is what
            // makes the serialized timestamp end in 'Z', so the browser
            // correctly converts it to each viewer's own local time.
            foreach (var row in rows)
                row.PostedAt = DateTime.SpecifyKind(row.PostedAt, DateTimeKind.Utc);
            return rows;
        }

        public async Task<bool> TogglePinAsync(int id)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE Announcements SET IsPinned = CASE WHEN IsPinned = 1 THEN 0 ELSE 1 END WHERE AnnouncementID = @Id",
                new { Id = id });
            return rows > 0;
        }

        public async Task<Announcement?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(Announcement data)   => await _repo.AddAsync(data);
        public async Task<bool> Update(Announcement data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id)            => await _repo.DeleteAsync(id);
    }
}
