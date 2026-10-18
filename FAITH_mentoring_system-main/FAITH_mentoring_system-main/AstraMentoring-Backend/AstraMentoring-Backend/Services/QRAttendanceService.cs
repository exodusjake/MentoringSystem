using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class QRAttendanceService
    {
        private readonly string _connectionString;
        private const int TokenLifetimeSeconds = 90;

        public QRAttendanceService(IConfiguration config)
        {
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        // Mentee must be actively assigned to the session's mentor, plus the scanner's
        // roster rules: make-up = approved booking for the slot; regular = matching section.
        private const string MenteeInSessionSql = """
            SELECT COUNT(*) FROM Sessions s
            WHERE s.SessionID=@sessionId
              AND EXISTS (SELECT 1 FROM MentorMentee mm WHERE mm.MentorID=s.MentorID AND mm.MenteeID=@menteeId AND mm.IsActive=1)
              AND (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                   OR EXISTS(SELECT 1 FROM MenteeProfiles mp JOIN Users u ON u.UserID=mp.UserID
                             WHERE mp.UserID=@menteeId AND u.IsActive=1 AND u.Role='Mentee' AND ISNULL(mp.IsDropOut,0)=0))
              AND (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                   OR EXISTS(SELECT 1 FROM MentorMentee mm WHERE mm.MentorID=s.MentorID AND mm.MenteeID=@menteeId AND mm.IsActive=1 AND mm.AssignedDate<=s.SessionDate))
              AND (
                (s.RequestID IS NOT NULL AND EXISTS (
                    SELECT 1 FROM SessionRequests m JOIN SessionRequests r ON r.AvailabilityID=m.AvailabilityID
                    WHERE m.RequestID=s.RequestID AND r.Status='Approved' AND r.MenteeID=@menteeId))
                OR (s.RequestID IS NULL AND EXISTS(SELECT 1 FROM SessionCourseScopes c JOIN MenteeProfiles cp ON cp.UserID=@menteeId
                      WHERE c.SessionID=s.SessionID AND c.Origin='Regular' AND cp.School=c.School
                        AND UPPER(REPLACE(cp.Course,' ',''))=UPPER(REPLACE(c.CourseCode,' ',''))))
                OR (s.RequestID IS NULL AND NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                    AND (s.SectionCode IS NULL OR s.SectionCode=(
                    SELECT COALESCE(sec.SectionCode,mp.Section) FROM MenteeProfiles mp
                    LEFT JOIN Sections sec ON sec.SectionID=mp.SectionID WHERE mp.UserID=@menteeId)))
                OR (NOT EXISTS(SELECT 1 FROM SessionCourseScopes c WHERE c.SessionID=s.SessionID)
                    AND EXISTS (SELECT 1 FROM Attendance a WHERE a.SessionID=s.SessionID AND a.MenteeID=@menteeId)))
            """;

        public async Task<QRGenerateResult> GenerateTokenAsync(int sessionId, int menteeId)
        {
            var token     = Guid.NewGuid().ToString("N");
            var expiresAt = DateTime.UtcNow.AddSeconds(TokenLifetimeSeconds);
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx=conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            if (await conn.ExecuteScalarAsync<int>(MenteeInSessionSql, new { sessionId, menteeId }, tx) == 0)
                return new QRGenerateResult { Message="You are not part of this session." };
            if (!await CheckpointWindowPolicy.CanAttendAsync(conn,sessionId,tx))
                return new QRGenerateResult { Message=CheckpointWindowPolicy.Error };
            await conn.ExecuteAsync(
                "EXEC sp_GenerateQRToken @SessionID, @MenteeID, @Token, @ExpiresAt",
                new { SessionID = sessionId, MenteeID = menteeId, Token = token, ExpiresAt = expiresAt },tx);
            tx.Commit();
            return new QRGenerateResult { Token = token, ExpiresAt = expiresAt };
        }

        // Every check runs before sp_ScanQRAttendance, so a rejected scan saves nothing.
        public async Task<QRScanResult> ScanTokenAsync(string token, int mentorId, int? expectedSessionId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.OpenAsync();
            using var tx=conn.BeginTransaction(System.Data.IsolationLevel.Serializable);
            var owner=await conn.QuerySingleOrDefaultAsync<(int SessionID, int MentorID, int MenteeID, string? SchoolYear, string? Semester, string? SlotName)?>(
                @"SELECT q.SessionID, s.MentorID, q.MenteeID, s.SchoolYear, s.Semester, s.SlotName
                  FROM QRTokens q JOIN Sessions s ON s.SessionID=q.SessionID WHERE q.Token=@token",
                new { token }, tx);
            if (!owner.HasValue)
                return new QRScanResult {Success=false,Message="Invalid QR code."};
            if (expectedSessionId.HasValue && owner.Value.SessionID != expectedSessionId.Value)
                return new QRScanResult {Success=false,Message="This QR code is for a different session."};
            if (owner.Value.MentorID != mentorId)
                return new QRScanResult {Success=false,Message="This QR code is for another mentor's session."};
            await CheckpointAttendanceLock.AcquireAsync(conn, tx, owner.Value.MentorID, owner.Value.MenteeID,
                owner.Value.SchoolYear, owner.Value.Semester, owner.Value.SlotName);
            if (await conn.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM MentorMentee WHERE MentorID=@mentorId AND MenteeID=@menteeId AND IsActive=1",
                    new { mentorId, menteeId=owner.Value.MenteeID },tx) == 0)
                return new QRScanResult {Success=false,Message="This mentee is not assigned to you."};
            if (!await CheckpointWindowPolicy.CanAttendAsync(conn,owner.Value.SessionID,tx))
                return new QRScanResult {Success=false,Message=CheckpointWindowPolicy.Error};
            if(await conn.ExecuteScalarAsync<int>(MenteeInSessionSql,new {sessionId=owner.Value.SessionID,menteeId=owner.Value.MenteeID},tx)==0)
                return new QRScanResult {Success=false,Message="This mentee is not eligible for this session's course or approved booking."};
            var result = await conn.QueryFirstOrDefaultAsync<QRScanResult>(
                "EXEC sp_ScanQRAttendance @Token",
                new { Token = token },tx);
            if (result?.Success == true)
            {
                await conn.ExecuteAsync("""
                    INSERT SessionCourseMembers(SessionID,MenteeID,School,CourseCode)
                    SELECT c.SessionID,@menteeId,c.School,c.CourseCode FROM SessionCourseScopes c
                    WHERE c.SessionID=@sessionId AND c.Origin='Regular'
                      AND NOT EXISTS(SELECT 1 FROM SessionCourseMembers m WHERE m.SessionID=c.SessionID AND m.MenteeID=@menteeId)
                    ;UPDATE logs SET NeedsUpdate=1
                    FROM CourseCheckpointLogs logs JOIN Sessions s ON s.MentorID=logs.MentorID AND s.SchoolYear=logs.SchoolYear AND s.Semester=logs.Semester AND s.SlotName=logs.SlotName
                    JOIN SessionCourseMembers m ON m.SessionID=s.SessionID AND m.School=logs.School AND m.CourseCode=logs.CourseCode
                    WHERE s.SessionID=@sessionId AND m.MenteeID=@menteeId AND logs.SubmittedAt IS NOT NULL;
                    """,new {sessionId=owner.Value.SessionID,menteeId=owner.Value.MenteeID},tx);
                await conn.ExecuteAsync(@"
                    UPDATE Sessions SET Status='Scheduled'
                    WHERE SessionID=@SessionID AND Status='Completed' AND TimeEnd IS NULL",
                    new { SessionID = owner.Value.SessionID }, tx);
                tx.Commit();
            }
            return result ?? new QRScanResult { Success = false, Message = "Invalid QR code." };
        }
    }

    public class QRGenerateResult
    {
        public string? Message { get; set; }
        public string   Token     { get; set; } = string.Empty;
        public DateTime ExpiresAt { get; set; }
    }

    public class QRScanResult
    {
        public bool   Success    { get; set; }
        public int    MenteeId   { get; set; }
        public int    SessionId  { get; set; }
        public string MenteeName { get; set; } = string.Empty;
        public string Message    { get; set; } = string.Empty;
    }

}
