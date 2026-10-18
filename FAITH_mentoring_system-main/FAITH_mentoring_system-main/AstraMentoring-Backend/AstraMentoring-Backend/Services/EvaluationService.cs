using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class EvaluationService
    {
        private readonly IGenericRepository<EvaluationLink> _repo;
        private readonly string _connectionString;
        public EvaluationService(IGenericRepository<EvaluationLink> repo, IConfiguration config)
        {
            _repo = repo;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("DefaultConnection is required.");
        }

        public async Task<IEnumerable<EvaluationLinkWithAuthor>> GetAll()
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<EvaluationLinkWithAuthor>("""
                SELECT e.*, NULLIF(LTRIM(RTRIM(CONCAT(u.FirstName, ' ', u.LastName))), '') AS PostedByName
                FROM EvaluationLinks e LEFT JOIN Users u ON u.UserID = e.PostedByUserID
                """);
        }
        public async Task<EvaluationLink?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(EvaluationLink data) => await _repo.AddAsync(data);
        public async Task<bool> Update(EvaluationLink data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }

    public class EvaluationLinkWithAuthor : EvaluationLink
    {
        public string? PostedByName { get; set; }
    }
}
