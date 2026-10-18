using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class ProofOfSessionService
    {
        private readonly IGenericRepository<ProofOfSession> _repo;
        private readonly string _connectionString;
        public ProofOfSessionService(IGenericRepository<ProofOfSession> repo, IConfiguration? configuration = null)
        {
            _repo = repo;
            _connectionString = configuration?.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        // Serialize uploads for a session without deleting historical files or records.
        // Existing duplicate records require separate review, never silent deletion.
        internal const string SaveUploadSql = """
            IF NOT EXISTS (SELECT 1 FROM dbo.Sessions WITH (UPDLOCK,HOLDLOCK)
                WHERE SessionID=@SessionID AND MentorID=@UploadedByUserID AND Status<>'Cancelled')
                THROW 50001, 'Session is unavailable for proof upload.', 1;
            IF NOT EXISTS (SELECT 1 FROM dbo.Attendance WHERE SessionID=@SessionID AND IsPresent=1 AND ScannedAt IS NOT NULL)
                THROW 50001, 'Verified attendance is required.', 1;
            IF (SELECT COUNT(*) FROM dbo.ProofOfSession WHERE SessionID=@SessionID)>1
                THROW 50001, 'Multiple existing proofs require review.', 1;
            IF EXISTS (SELECT 1 FROM dbo.ProofOfSession WHERE SessionID=@SessionID)
                UPDATE dbo.ProofOfSession SET FilePath=@FilePath,FileType=@FileType,
                    UploadedByUserID=@UploadedByUserID,UploadedAt=@UploadedAt WHERE SessionID=@SessionID;
            ELSE
                INSERT dbo.ProofOfSession (SessionID,UploadedByUserID,FilePath,FileType,UploadedAt)
                    VALUES (@SessionID,@UploadedByUserID,@FilePath,@FileType,@UploadedAt);
            """;

        public async Task<bool> SaveUpload(ProofOfSession proof, CancellationToken cancellationToken)
        {
            using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(cancellationToken);
            using var transaction = connection.BeginTransaction();
            await connection.ExecuteAsync(new CommandDefinition(SaveUploadSql, proof, transaction,
                cancellationToken: cancellationToken));
            cancellationToken.ThrowIfCancellationRequested();
            transaction.Commit();
            return true;
        }

        public async Task<IEnumerable<ProofOfSession>> GetAll() => await _repo.GetAllAsync();
        public async Task<ProofOfSession?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(ProofOfSession data) => await _repo.AddAsync(data);
        public async Task<bool> Update(ProofOfSession data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);
    }
}
