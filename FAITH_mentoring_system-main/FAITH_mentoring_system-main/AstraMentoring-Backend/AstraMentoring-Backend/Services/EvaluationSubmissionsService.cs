using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class EvaluationSubmissionsService
    {
        private readonly string _connectionString;

        public EvaluationSubmissionsService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        // ── Mentee: which forms have I already submitted, and what did I
        //    upload as proof? (used to render "View" on the mentee's own
        //    card, not just a plain Submitted badge). ──────────────────────────
        public async Task<List<MySubmissionDto>> GetMyLinkIdsAsync(int menteeId)
        {
            using var conn = new SqlConnection(_connectionString);
            return (await conn.QueryAsync<MySubmissionDto>(
                "SELECT LinkID, ProofFilePath, SubmittedAt FROM EvaluationSubmissions WHERE MenteeID = @MenteeID",
                new { MenteeID = menteeId })).ToList();
        }

        // ── Mentee: mark submitted BY uploading a proof screenshot — the
        //    upload itself is the submit action, no separate confirm step.
        //    Safe to call again (re-upload just replaces the path/timestamp;
        //    the caller is responsible for cleaning up the old physical file
        //    when doing so). ────────────────────────────────────────────────
        public async Task MarkSubmittedWithProofAsync(int linkId, int menteeId, string proofFilePath)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(@"
                MERGE dbo.EvaluationSubmissions AS target
                USING (SELECT @LinkID AS LinkID, @MenteeID AS MenteeID) AS src
                  ON target.LinkID = src.LinkID AND target.MenteeID = src.MenteeID
                WHEN MATCHED THEN
                  UPDATE SET SubmittedAt = GETDATE(), ProofFilePath = @ProofFilePath
                WHEN NOT MATCHED THEN
                  INSERT (LinkID, MenteeID, SubmittedAt, ProofFilePath)
                  VALUES (src.LinkID, src.MenteeID, GETDATE(), @ProofFilePath);",
                new { LinkID = linkId, MenteeID = menteeId, ProofFilePath = proofFilePath });
        }

        // ── Mentee: undo an accidental mark — returns the proof file path
        //    that was on the deleted row (if any) so the controller can clean
        //    up the physical file; null means either nothing was deleted, or
        //    the row had no proof attached. ──────────────────────────────────
        public async Task<(bool Found, string? ProofFilePath)> UnmarkAsync(int linkId, int menteeId)
        {
            using var conn = new SqlConnection(_connectionString);
            var proofPath = await conn.ExecuteScalarAsync<string?>(
                "SELECT ProofFilePath FROM EvaluationSubmissions WHERE LinkID = @LinkID AND MenteeID = @MenteeID",
                new { LinkID = linkId, MenteeID = menteeId });
            var rows = await conn.ExecuteAsync(
                "DELETE FROM EvaluationSubmissions WHERE LinkID = @LinkID AND MenteeID = @MenteeID",
                new { LinkID = linkId, MenteeID = menteeId });
            return (rows > 0, proofPath);
        }

        // ── Admin: submitted/total count per evaluation link, for the card
        //    badge — scoped to active, non-dropped-out mentees (matches how
        //    every other progress count in the system excludes them). ────────
        public async Task<List<EvaluationSubmissionSummaryDto>> GetSummaryAsync()
        {
            using var conn = new SqlConnection(_connectionString);
            return (await conn.QueryAsync<EvaluationSubmissionSummaryDto>(@"
                ;WITH ActiveMentees AS (
                    SELECT u.UserID FROM dbo.Users u
                    JOIN dbo.MenteeProfiles mp ON mp.UserID = u.UserID
                    WHERE u.Role = 'Mentee' AND u.IsActive = 1 AND ISNULL(mp.IsDropOut, 0) = 0
                )
                SELECT
                    el.LinkID,
                    (SELECT COUNT(*) FROM ActiveMentees)                        AS TotalMentees,
                    (SELECT COUNT(DISTINCT es.MenteeID)
                     FROM   dbo.EvaluationSubmissions es
                     JOIN   ActiveMentees am ON am.UserID = es.MenteeID
                     WHERE  es.LinkID = el.LinkID)                              AS SubmittedCount
                FROM dbo.EvaluationLinks el")).ToList();
        }

        // ── Admin: full per-mentee breakdown for one evaluation link (the
        //    "who's done / who's not" detail view). ────────────────────────
        public async Task<List<EvaluationSubmissionRowDto>> GetDetailAsync(int linkId)
        {
            using var conn = new SqlConnection(_connectionString);
            return (await conn.QueryAsync<EvaluationSubmissionRowDto>(@"
                SELECT
                    u.UserID AS MenteeID,
                    u.FirstName, u.LastName, u.StudentNumber,
                    CASE WHEN es.SubmissionID IS NOT NULL THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS HasSubmitted,
                    es.SubmittedAt,
                    es.ProofFilePath
                FROM   dbo.Users u
                JOIN   dbo.MenteeProfiles mp ON mp.UserID = u.UserID
                LEFT   JOIN dbo.EvaluationSubmissions es ON es.MenteeID = u.UserID AND es.LinkID = @LinkID
                WHERE  u.Role = 'Mentee' AND u.IsActive = 1 AND ISNULL(mp.IsDropOut, 0) = 0
                ORDER  BY HasSubmitted DESC, u.LastName, u.FirstName",
                new { LinkID = linkId })).ToList();
        }
    }

    public class EvaluationSubmissionSummaryDto
    {
        public int LinkID          { get; set; }
        public int TotalMentees    { get; set; }
        public int SubmittedCount  { get; set; }
    }

    public class EvaluationSubmissionRowDto
    {
        public int       MenteeID      { get; set; }
        public string    FirstName     { get; set; } = string.Empty;
        public string    LastName      { get; set; } = string.Empty;
        public string?   StudentNumber { get; set; }
        public bool      HasSubmitted  { get; set; }
        public DateTime? SubmittedAt   { get; set; }
        public string?   ProofFilePath { get; set; }
    }

    public class MySubmissionDto
    {
        public int       LinkID        { get; set; }
        public string?   ProofFilePath { get; set; }
        public DateTime  SubmittedAt   { get; set; }
    }
}
