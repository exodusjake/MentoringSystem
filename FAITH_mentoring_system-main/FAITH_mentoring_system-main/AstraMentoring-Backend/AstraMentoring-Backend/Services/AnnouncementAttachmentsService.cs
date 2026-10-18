using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class AnnouncementAttachmentsService
    {
        private readonly IGenericRepository<AnnouncementAttachment> _repo;
        private readonly string _connectionString;

        public AnnouncementAttachmentsService(IGenericRepository<AnnouncementAttachment> repo, IConfiguration config)
        {
            _repo = repo;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<AnnouncementAttachment>> GetAll()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<AnnouncementAttachment>(
                "SELECT * FROM AnnouncementAttachments ORDER BY UploadedAt ASC");
        }

        public async Task<IEnumerable<AnnouncementAttachment>> GetByAnnouncementId(int announcementId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<AnnouncementAttachment>(
                "SELECT * FROM AnnouncementAttachments WHERE AnnouncementID = @id ORDER BY UploadedAt ASC",
                new { id = announcementId });
        }

        public async Task<AnnouncementAttachment?> GetById(int id) => await _repo.GetByIdAsync(id);

        public async Task<bool> Add(AnnouncementAttachment data) => await _repo.AddAsync(data);

        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}
