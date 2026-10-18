using System.Net;
using System.Net.Http.Json;
using Dapper;

namespace AstraMentoringAPI.Tests;

// Every test builds its own temporary rows and removes them afterwards, so a
// regression can never delete or change real sessions, attendance or files.
public class SecurityFixesTests : IClassFixture<TestWebApplicationFactory>
{
    private readonly TestWebApplicationFactory _factory;
    public SecurityFixesTests(TestWebApplicationFactory factory) => _factory = factory;

    private const string WindowError = "This checkpoint is closed, has no session schedule, or the selected date is outside its session window. Refresh the calendar and choose an available checkpoint.";

    private record ScanResult(bool Success, string Message);
    private record MessageBody(string Message);

    private async Task<HttpClient> ClientFor(string email)
    {
        var client = _factory.CreateClient();
        AuthHelper.SetBearerToken(client, await AuthHelper.GetTokenAsync(client, email));
        return client;
    }

    private static async Task<int> CreateSessionAsync(int mentorId, string status, bool finished, string? sectionCode = null)
    {
        using var conn = TestDb.Open();
        return await conn.ExecuteScalarAsync<int>(@"
            INSERT INTO Sessions (MentorID, SessionDate, Status, TimeEnd, SchoolYear, Semester, SectionCode, Notes)
            OUTPUT INSERTED.SessionID
            VALUES (@mentorId, GETDATE(), @status, CASE WHEN @finished=1 THEN GETDATE() END,
                    (SELECT SettingValue FROM SystemSettings WHERE SettingKey='SchoolYear'),
                    (SELECT SettingValue FROM SystemSettings WHERE SettingKey='Semester'),
                    @sectionCode, 'automated-test-fixture')",
            new { mentorId, status, finished, sectionCode });
    }

    private static async Task<string> CreateTokenAsync(int sessionId, int menteeId)
    {
        var token = "test-" + Guid.NewGuid().ToString("N");
        using var conn = TestDb.Open();
        await conn.ExecuteAsync(@"INSERT INTO QRTokens (Token, SessionID, MenteeID, ExpiresAt, IsUsed)
            VALUES (@token, @sessionId, @menteeId, DATEADD(MINUTE, 5, SYSUTCDATETIME()), 0)",
            new { token, sessionId, menteeId });
        return token;
    }

    private static async Task CleanupSessionAsync(int sessionId)
    {
        using var conn = TestDb.Open();
        await conn.ExecuteAsync(@"
            DELETE FROM QRTokens   WHERE SessionID=@sessionId;
            DELETE FROM Attendance WHERE SessionID=@sessionId;
            DELETE FROM Sessions   WHERE SessionID=@sessionId;", new { sessionId });
    }

    private static async Task<(bool Used, int AttendanceRows)> TokenStateAsync(string token, int sessionId)
    {
        using var conn = TestDb.Open();
        var used = await conn.ExecuteScalarAsync<bool>("SELECT IsUsed FROM QRTokens WHERE Token=@token", new { token });
        var rows = await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Attendance WHERE SessionID=@sessionId", new { sessionId });
        return (used, rows);
    }

    // ── QR scan ────────────────────────────────────────────────────────────

    [Fact]
    public async Task Mentor_Scanning_Another_Mentors_Session_Token_Is_Rejected_And_Saves_Nothing()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Scheduled", finished: false);
        try
        {
            var token  = await CreateTokenAsync(sessionId, TestAccounts.MenteeId);
            var client = await ClientFor(TestAccounts.OtherMentorEmail);

            var result = await (await client.PostAsJsonAsync("/api/QRAttendance/scan", new { token, sessionId }))
                .Content.ReadFromJsonAsync<ScanResult>();

            Assert.False(result!.Success);
            Assert.Equal("This QR code is for another mentor's session.", result.Message);
            Assert.Equal((false, 0), await TokenStateAsync(token, sessionId));
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    [Fact]
    public async Task Scanning_A_Token_For_A_Different_Session_Is_Rejected_And_Saves_Nothing()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Scheduled", finished: false);
        try
        {
            var token  = await CreateTokenAsync(sessionId, TestAccounts.MenteeId);
            var client = await ClientFor(TestAccounts.MentorEmail);

            var result = await (await client.PostAsJsonAsync("/api/QRAttendance/scan", new { token, sessionId = sessionId + 1_000_000 }))
                .Content.ReadFromJsonAsync<ScanResult>();

            Assert.False(result!.Success);
            Assert.Equal("This QR code is for a different session.", result.Message);
            Assert.Equal((false, 0), await TokenStateAsync(token, sessionId));
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    [Fact]
    public async Task Mentor_Cannot_Scan_A_Mentee_Who_Is_Not_Assigned_To_Them()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Scheduled", finished: false);
        try
        {
            int otherMenteeId;
            using (var conn = TestDb.Open())
                otherMenteeId = await conn.ExecuteScalarAsync<int>(@"
                    SELECT TOP 1 u.UserID FROM Users u
                    WHERE u.Role='Mentee' AND NOT EXISTS (SELECT 1 FROM MentorMentee mm
                        WHERE mm.MentorID=@mentorId AND mm.MenteeID=u.UserID AND mm.IsActive=1)",
                    new { mentorId = TestAccounts.MentorId });
            var token  = await CreateTokenAsync(sessionId, otherMenteeId);
            var client = await ClientFor(TestAccounts.MentorEmail);

            var result = await (await client.PostAsJsonAsync("/api/QRAttendance/scan", new { token, sessionId }))
                .Content.ReadFromJsonAsync<ScanResult>();

            Assert.False(result!.Success);
            Assert.Equal("This mentee is not assigned to you.", result.Message);
            Assert.Equal((false, 0), await TokenStateAsync(token, sessionId));
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    [Fact]
    public async Task Existing_Record_In_Another_Mentors_Session_Does_Not_Let_A_Mentee_Generate_A_QR()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.OtherMentorId, "Scheduled", finished: false);
        try
        {
            using (var conn = TestDb.Open())
                await conn.ExecuteAsync("INSERT INTO Attendance (SessionID, MenteeID, IsPresent) VALUES (@sessionId, @menteeId, 0)",
                    new { sessionId, menteeId = TestAccounts.MenteeId });
            var client   = await ClientFor(TestAccounts.MenteeEmail);
            var response = await client.PostAsJsonAsync("/api/QRAttendance/generate", new { sessionId, menteeId = TestAccounts.MenteeId });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("You are not part of this session.", (await response.Content.ReadFromJsonAsync<MessageBody>())!.Message);
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    [Fact]
    public async Task Scanning_An_Unknown_Token_Says_Invalid_QR()
    {
        var client = await ClientFor(TestAccounts.MentorEmail);

        var result = await (await client.PostAsJsonAsync("/api/QRAttendance/scan", new { token = "not-a-real-token" }))
            .Content.ReadFromJsonAsync<ScanResult>();

        Assert.False(result!.Success);
        Assert.Equal("Invalid QR code.", result.Message);
    }

    [Fact]
    public async Task Owning_Mentor_With_Matching_Session_Passes_The_New_Checks()
    {
        // Finished session: the new checks pass, then the existing window rule stops it.
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Completed", finished: true);
        try
        {
            var token  = await CreateTokenAsync(sessionId, TestAccounts.MenteeId);
            var client = await ClientFor(TestAccounts.MentorEmail);

            var result = await (await client.PostAsJsonAsync("/api/QRAttendance/scan", new { token, sessionId }))
                .Content.ReadFromJsonAsync<ScanResult>();

            Assert.Equal(WindowError, result!.Message);
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    // ── QR generate ────────────────────────────────────────────────────────

    [Fact]
    public async Task Mentee_Cannot_Generate_A_QR_For_A_Session_They_Are_Not_Part_Of()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.OtherMentorId, "Scheduled", finished: false);
        try
        {
            var client   = await ClientFor(TestAccounts.MenteeEmail);
            var response = await client.PostAsJsonAsync("/api/QRAttendance/generate", new { sessionId, menteeId = TestAccounts.MenteeId });

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal("You are not part of this session.", (await response.Content.ReadFromJsonAsync<MessageBody>())!.Message);
            using var conn = TestDb.Open();
            Assert.Equal(0, await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM QRTokens WHERE SessionID=@sessionId", new { sessionId }));
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    [Fact]
    public async Task Mentee_Of_The_Mentor_Passes_The_Membership_Check()
    {
        // Finished session: membership passes, then the existing window rule stops it.
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Completed", finished: true);
        try
        {
            var client   = await ClientFor(TestAccounts.MenteeEmail);
            var response = await client.PostAsJsonAsync("/api/QRAttendance/generate", new { sessionId, menteeId = TestAccounts.MenteeId });

            Assert.Equal(WindowError, (await response.Content.ReadFromJsonAsync<MessageBody>())!.Message);
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    // ── Session delete ─────────────────────────────────────────────────────

    [Fact]
    public async Task Completed_Session_Cannot_Be_Deleted()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Completed", finished: true);
        try
        {
            var client   = await ClientFor(TestAccounts.MentorEmail);
            var response = await client.DeleteAsync($"/api/Sessions/{sessionId}");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            using var conn = TestDb.Open();
            Assert.Equal(1, await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Sessions WHERE SessionID=@sessionId", new { sessionId }));
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    [Fact]
    public async Task Session_With_Scanned_Attendance_Cannot_Be_Deleted_Even_If_Not_Completed()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Scheduled", finished: false);
        try
        {
            using (var conn = TestDb.Open())
                await conn.ExecuteAsync("INSERT INTO Attendance (SessionID, MenteeID, IsPresent, ScannedAt) VALUES (@sessionId, @menteeId, 1, SYSUTCDATETIME())",
                    new { sessionId, menteeId = TestAccounts.MenteeId });
            var client   = await ClientFor(TestAccounts.MentorEmail);
            var response = await client.DeleteAsync($"/api/Sessions/{sessionId}");

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    [Fact]
    public async Task Scheduled_Session_Without_Attendance_Can_Still_Be_Deleted()
    {
        var sessionId = await CreateSessionAsync(TestAccounts.MentorId, "Scheduled", finished: false);
        try
        {
            var client   = await ClientFor(TestAccounts.MentorEmail);
            var response = await client.DeleteAsync($"/api/Sessions/{sessionId}");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            using var conn = TestDb.Open();
            Assert.Equal(0, await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM Sessions WHERE SessionID=@sessionId", new { sessionId }));
        }
        finally { await CleanupSessionAsync(sessionId); }
    }

    // ── Announcement attachments ───────────────────────────────────────────

    private static async Task<int> CreateHiddenAnnouncementAsync(int posterId)
    {
        using var conn = TestDb.Open();
        return await conn.ExecuteScalarAsync<int>(@"
            INSERT INTO Announcements (PostedByUserID, Title, Content, TargetAudience, IsActive)
            OUTPUT INSERTED.AnnouncementID
            VALUES (@posterId, 'automated-test-fixture', 'automated-test-fixture', 'Mentee', 0)", new { posterId });
    }

    private static async Task CleanupAnnouncementAsync(int announcementId)
    {
        using var conn = TestDb.Open();
        await conn.ExecuteAsync(@"
            DELETE FROM AnnouncementAttachments WHERE AnnouncementID=@announcementId;
            DELETE FROM Announcements WHERE AnnouncementID=@announcementId;", new { announcementId });
    }

    private static MultipartFormDataContent TextUpload(int announcementId)
    {
        var form = new MultipartFormDataContent();
        form.Add(new StringContent(announcementId.ToString()), "announcementId");
        form.Add(new ByteArrayContent("automated test"u8.ToArray()), "file", "automated-test.txt");
        return form;
    }

    [Fact]
    public async Task Mentor_Cannot_Upload_An_Attachment_To_Someone_Elses_Announcement()
    {
        var announcementId = await CreateHiddenAnnouncementAsync(TestAccounts.MentorId);
        try
        {
            var client   = await ClientFor(TestAccounts.OtherMentorEmail);
            var response = await client.PostAsync("/api/AnnouncementAttachments/upload", TextUpload(announcementId));

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            using var conn = TestDb.Open();
            Assert.Equal(0, await conn.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM AnnouncementAttachments WHERE AnnouncementID=@announcementId", new { announcementId }));
        }
        finally { await CleanupAnnouncementAsync(announcementId); }
    }

    [Fact]
    public async Task Mentor_Cannot_Delete_An_Attachment_On_Someone_Elses_Announcement()
    {
        var announcementId = await CreateHiddenAnnouncementAsync(TestAccounts.MentorId);
        try
        {
            int attachmentId;
            using (var conn = TestDb.Open())
                attachmentId = await conn.ExecuteScalarAsync<int>(@"
                    INSERT INTO AnnouncementAttachments (AnnouncementID, FileName, FilePath)
                    OUTPUT INSERTED.AttachmentID
                    VALUES (@announcementId, 'automated-test.txt', '/uploads/announcements/automated-test-missing.txt')", new { announcementId });

            var client   = await ClientFor(TestAccounts.OtherMentorEmail);
            var response = await client.DeleteAsync($"/api/AnnouncementAttachments/{attachmentId}");

            Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
            using var check = TestDb.Open();
            Assert.Equal(1, await check.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM AnnouncementAttachments WHERE AttachmentID=@attachmentId", new { attachmentId }));
        }
        finally { await CleanupAnnouncementAsync(announcementId); }
    }

    [Fact]
    public async Task Poster_Can_Still_Upload_And_Delete_Their_Own_Attachment()
    {
        var announcementId = await CreateHiddenAnnouncementAsync(TestAccounts.MentorId);
        try
        {
            var client = await ClientFor(TestAccounts.MentorEmail);
            var upload = await client.PostAsync("/api/AnnouncementAttachments/upload", TextUpload(announcementId));
            Assert.Equal(HttpStatusCode.OK, upload.StatusCode);

            int attachmentId;
            using (var conn = TestDb.Open())
                attachmentId = await conn.ExecuteScalarAsync<int>("SELECT AttachmentID FROM AnnouncementAttachments WHERE AnnouncementID=@announcementId", new { announcementId });

            var delete = await client.DeleteAsync($"/api/AnnouncementAttachments/{attachmentId}");
            Assert.Equal(HttpStatusCode.OK, delete.StatusCode);
        }
        finally { await CleanupAnnouncementAsync(announcementId); }
    }
}
