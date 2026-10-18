using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    // Admin-entered 0-100% Evaluation Rating per mentor per School Year +
    // Semester — 50% of the Phase 3 ranking formula (see
    // MonitorActivitiesService, which reads this for OverallPercent). One
    // row per mentor per period; PUT upserts rather than logging history,
    // same "current value only" convention as SystemSettings.
    public class EvaluationRatingsService
    {
        private readonly string _connectionString;

        public EvaluationRatingsService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<decimal?> GetAsync(int mentorId, string schoolYear, string semester)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<decimal?>(
                @"SELECT RatingPct FROM EvaluationRatings
                  WHERE MentorID = @MentorID AND SchoolYear = @SchoolYear AND Semester = @Semester",
                new { MentorID = mentorId, SchoolYear = schoolYear, Semester = semester });
        }

        // Batch form of GetAsync — MonitorActivitiesService needs every
        // mentor's rating for the current period at once, not one at a time.
        public async Task<Dictionary<int, decimal>> GetAllForPeriodAsync(string schoolYear, string semester, CancellationToken cancellationToken = default)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.QueryAsync<(int MentorID, decimal RatingPct)>(new CommandDefinition(
                "SELECT MentorID, RatingPct FROM EvaluationRatings WHERE SchoolYear = @SchoolYear AND Semester = @Semester",
                new { SchoolYear = schoolYear, Semester = semester }, cancellationToken: cancellationToken));
            return rows.ToDictionary(r => r.MentorID, r => r.RatingPct);
        }

        public async Task UpsertAsync(int mentorId, string schoolYear, string semester, decimal ratingPct, int adminId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                @"MERGE EvaluationRatings AS target
                  USING (SELECT @MentorID AS MentorID, @SchoolYear AS SchoolYear, @Semester AS Semester) AS src
                    ON target.MentorID = src.MentorID AND target.SchoolYear = src.SchoolYear AND target.Semester = src.Semester
                  WHEN MATCHED THEN
                    UPDATE SET RatingPct = @RatingPct, UpdatedAt = GETDATE(), UpdatedByAdminID = @AdminID
                  WHEN NOT MATCHED THEN
                    INSERT (MentorID, SchoolYear, Semester, RatingPct, UpdatedAt, UpdatedByAdminID)
                    VALUES (@MentorID, @SchoolYear, @Semester, @RatingPct, GETDATE(), @AdminID);",
                new { MentorID = mentorId, SchoolYear = schoolYear, Semester = semester, RatingPct = ratingPct, AdminID = adminId });
        }

        public async Task DeleteAsync(int mentorId, string schoolYear, string semester)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                "DELETE FROM EvaluationRatings WHERE MentorID = @MentorID AND SchoolYear = @SchoolYear AND Semester = @Semester",
                new { MentorID = mentorId, SchoolYear = schoolYear, Semester = semester });
        }
    }
}
