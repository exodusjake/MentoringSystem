using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public sealed class AttendanceNotEligibleException : InvalidOperationException
    {
        public AttendanceNotEligibleException()
            : base("This mentee was not eligible for attendance on the session date.") { }
    }

    public class AttendanceService
    {
        private readonly IGenericRepository<Attendance> _repo;
        private readonly string _connectionString;

        public AttendanceService(IGenericRepository<Attendance> repo, IConfiguration config)
        {
            _repo = repo;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<Attendance>> GetAll() => await _repo.GetAllAsync();
        public async Task<Attendance?> GetById(int id) => await _repo.GetByIdAsync(id);

        // Missing roster rows start absent. Never overwrite an existing QR result.
        public async Task<Attendance> EnsureAbsentAsync(Attendance data)
        {
            if (data.IsPresent || data.ScannedAt.HasValue)
                throw new InvalidOperationException("Presence requires QR scanning.");
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var transaction = conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var existing = await conn.QueryFirstOrDefaultAsync<Attendance>(
                "SELECT * FROM Attendance WITH (UPDLOCK, HOLDLOCK) WHERE SessionID = @SessionID AND MenteeID = @MenteeID",
                new { data.SessionID, data.MenteeID }, transaction);
            if (existing == null)
            {
                var eligible = await conn.ExecuteScalarAsync<int>(@"
                    SELECT CASE WHEN EXISTS (
                        SELECT 1
                        FROM Sessions s
                        JOIN MenteeProfiles mp ON mp.UserID=@MenteeID
                        WHERE s.SessionID=@SessionID
                          AND ISNULL(mp.IsDropOut,0)=0
                          AND (
                            (s.RequestID IS NULL AND EXISTS (
                                SELECT 1 FROM MentorMentee mm
                                LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID
                                WHERE mm.MentorID=s.MentorID AND mm.MenteeID=@MenteeID
                                  AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate
                                  AND (EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID AND c.Origin='Regular'
                                       AND c.School=mp.School AND UPPER(REPLACE(c.CourseCode,' ',''))=UPPER(REPLACE(mp.Course,' ','')))
                                    OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                                        AND (s.SectionCode IS NULL OR COALESCE(sec.SectionCode,mp.Section)=s.SectionCode)))))
                            OR
                            (s.RequestID IS NOT NULL AND EXISTS (
                                SELECT 1 FROM SessionRequests seed
                                JOIN SessionRequests booked ON booked.AvailabilityID=seed.AvailabilityID
                                WHERE seed.RequestID=s.RequestID AND booked.MenteeID=@MenteeID
                                  AND booked.Status='Approved'))
                          )
                    ) THEN 1 ELSE 0 END",
                    new { data.SessionID, data.MenteeID }, transaction);
                if (eligible == 0) throw new AttendanceNotEligibleException();

                existing = await conn.QuerySingleAsync<Attendance>(
                    """
                    INSERT INTO Attendance (SessionID, MenteeID, IsPresent, ScannedAt, Remarks, MentorNotes, AbsenceReason)
                    OUTPUT INSERTED.*
                    VALUES (@SessionID, @MenteeID, 0, NULL, @Remarks, @MentorNotes, @AbsenceReason)
                    """, data, transaction);
            }
            transaction.Commit();
            return existing;
        }

        public async Task<bool> PatchTextFieldAsync(int id, string field, string? value)
        {
            if (field is not ("Remarks" or "MentorNotes" or "AbsenceReason"))
                throw new ArgumentException("Unsupported text field.", nameof(field));
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteAsync($"UPDATE Attendance SET {field} = @Value WHERE AttendanceID = @Id",
                new { Id = id, Value = value }) > 0;
        }

        // Ownership lookups — the controller uses these to confirm a mentor
        // is only ever touching attendance for their own sessions, never an
        // arbitrary AttendanceID/SessionID someone else supplied.
        public async Task<int?> GetMentorIdForSessionAsync(int sessionId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int?>(
                "SELECT MentorID FROM Sessions WHERE SessionID = @SessionID",
                new { SessionID = sessionId });
        }

        public async Task<int?> GetSessionIdForAttendanceAsync(int attendanceId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int?>(
                "SELECT SessionID FROM Attendance WHERE AttendanceID = @Id",
                new { Id = attendanceId });
        }

        // Atomically writes all three text columns in one UPDATE — avoids race condition
        // that occurs when three separate PATCH calls do concurrent GET+UPDATE cycles.
        public async Task<bool> PatchTextFieldsAsync(int id, string? remarks, string? mentorNotes, string? absenceReason)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                @"UPDATE Attendance
                  SET Remarks = @Remarks, MentorNotes = @MentorNotes, AbsenceReason = @AbsenceReason
                  WHERE AttendanceID = @Id",
                new { Remarks = remarks, MentorNotes = mentorNotes, AbsenceReason = absenceReason, Id = id });
            return rows > 0;
        }
    }
}
