using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class EvaluationAttachmentsService
    {
        private readonly IGenericRepository<EvaluationAttachment> _repo;
        private readonly string _connectionString;

        public EvaluationAttachmentsService(IGenericRepository<EvaluationAttachment> repo, IConfiguration config)
        {
            _repo = repo;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<EvaluationAttachment>> GetAll()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<EvaluationAttachment>(
                "SELECT * FROM EvaluationAttachments ORDER BY UploadedAt ASC");
        }

        public async Task<IEnumerable<EvaluationAttachment>> GetByLinkId(int linkId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<EvaluationAttachment>(
                "SELECT * FROM EvaluationAttachments WHERE LinkID = @id ORDER BY UploadedAt ASC",
                new { id = linkId });
        }

        public async Task<EvaluationAttachment?> GetById(int id) => await _repo.GetByIdAsync(id);

        public async Task<bool> Add(EvaluationAttachment data) => await _repo.AddAsync(data);

        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}
