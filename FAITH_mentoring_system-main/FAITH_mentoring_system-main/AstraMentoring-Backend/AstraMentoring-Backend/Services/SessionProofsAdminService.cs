using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class SessionProofsAdminService
    {
        private readonly string _connectionString;

        public SessionProofsAdminService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        // Wrapped in SqlRetry — transient RDS timeouts seen intermittently here.
        public async Task<SessionProofsAdminResultDto> GetAsync() => await SqlRetry.ExecuteAsync(async () =>
        {
            using var conn  = new SqlConnection(_connectionString);
            using var multi = await conn.QueryMultipleAsync("EXEC sp_GetSessionProofs");
            var records = (await multi.ReadAsync<SessionProofRowDto>()).ToList();
            var mentors = (await multi.ReadAsync<MentorFilterDto>()).ToList();

            multi.Dispose();
            if (records.Count > 0)
            {
                var makeupIds=(await conn.QueryAsync<int>("SELECT SessionID FROM Sessions WHERE SessionID IN @Ids AND (RequestID IS NOT NULL OR SectionCode IS NULL)",new {Ids=records.Select(r=>r.SessionID).ToArray()})).ToHashSet();
                foreach(var record in records) record.IsMakeup=makeupIds.Contains(record.SessionID);
                var origins=(await conn.QueryAsync<(int SessionID,string Origin)>("SELECT DISTINCT SessionID,Origin FROM SessionCourseScopes WHERE SessionID IN @Ids",new {Ids=records.Select(r=>r.SessionID).ToArray()})).ToDictionary(r=>r.SessionID,r=>r.Origin);
                foreach(var record in records)if(origins.TryGetValue(record.SessionID,out var origin))record.IsMakeup=origin=="Makeup";
            }
            int total       = records.Count;
            int withProof   = records.Count(r => r.HasProof);
            int withoutProof = total - withProof;
            double coverage = total > 0 ? Math.Round((double)withProof / total * 100, 1) : 0;

            return new SessionProofsAdminResultDto
            {
                Records          = records,
                TotalSessions    = total,
                WithProof        = withProof,
                WithoutProof     = withoutProof,
                CoverageRate     = coverage,
                AvailableMentors = mentors
            };
        });
    }

    // ── DTOs ──────────────────────────────────────────────────────────────────

    public class SessionProofsAdminResultDto
    {
        public List<SessionProofRowDto> Records          { get; set; } = new();
        public int                      TotalSessions    { get; set; }
        public int                      WithProof        { get; set; }
        public int                      WithoutProof     { get; set; }
        public double                   CoverageRate     { get; set; }
        public List<MentorFilterDto>    AvailableMentors { get; set; } = new();
    }

    public class SessionProofRowDto
    {
        public bool IsMakeup { get; set; }
        public int       SessionID       { get; set; }
        public string?   SlotName        { get; set; }
        public DateTime? SessionDate     { get; set; }
        public string?   SectionCode     { get; set; }
        public string?   Topic           { get; set; }
        public int       MentorID        { get; set; }
        public string    MentorFirstName { get; set; } = string.Empty;
        public string    MentorLastName  { get; set; } = string.Empty;
        public string?   MentorSchool    { get; set; }
        public string?   MentorDepartment { get; set; }
        public int?      ProofID         { get; set; }
        public string?   FilePath        { get; set; }
        public string?   FileType        { get; set; }
        public DateTime? UploadedAt      { get; set; }
        public bool      HasProof        { get; set; }
    }
}
