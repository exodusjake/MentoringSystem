using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.Extensions.Configuration;

namespace AstraMentoringAPI.Tests;

// Evaluation ratings reference both the rated mentor and the admin who saved
// them. Uses temporary inactive accounts and a throwaway rating period, all
// removed afterwards.
public class HardDeleteRatingsTests
{
    private const string TestYear = "test-delete-ratings";
    private const string TestSemester = "test";

    [Fact]
    public async Task DeletingAdminKeepsRatingsAndDeletingMentorRemovesThem()
    {
        using var conn = TestDb.Open();
        var realMentorId = TestAccounts.OtherMentorId;
        var service = new ProfileService(null!, null!, null!, new ConfigurationBuilder()
            .SetBasePath(AppContext.BaseDirectory)
            .AddJsonFile("appsettings.json")
            .AddJsonFile("appsettings.Development.json", optional: true)
            .Build());

        int TempUser(string role) => conn.QuerySingle<int>(
            @"INSERT INTO Users (FirstName, LastName, Email, PasswordHash, Role, IsActive)
              OUTPUT INSERTED.UserID
              VALUES ('Delete', 'Test', @email, '-', @role, 0)",
            new { email = $"delete-ratings-{role.ToLower()}@invalid.test", role });
        void Rate(int mentorId, int adminId) => conn.Execute(
            @"INSERT INTO EvaluationRatings (MentorID, SchoolYear, Semester, RatingPct, UpdatedAt, UpdatedByAdminID)
              VALUES (@mentorId, @TestYear, @TestSemester, 90, GETDATE(), @adminId)",
            new { mentorId, adminId, TestYear, TestSemester });
        int Count(string sql, object p) => conn.ExecuteScalar<int>(sql, p);

        var adminId = TempUser("Admin");
        var mentorId = TempUser("Mentor");
        try
        {
            Rate(realMentorId, adminId);
            Rate(mentorId, adminId);

            Assert.Null(await service.GetHardDeleteBlockReasonAsync(adminId));
            await service.DeleteUser(adminId);
            Assert.Equal(0, Count("SELECT COUNT(*) FROM Users WHERE UserID = @adminId", new { adminId }));
            Assert.Equal(1, Count(
                "SELECT COUNT(*) FROM EvaluationRatings WHERE MentorID = @realMentorId AND SchoolYear = @TestYear AND UpdatedByAdminID IS NULL",
                new { realMentorId, TestYear }));

            Assert.Null(await service.GetHardDeleteBlockReasonAsync(mentorId));
            await service.DeleteUser(mentorId);
            Assert.Equal(0, Count("SELECT COUNT(*) FROM Users WHERE UserID = @mentorId", new { mentorId }));
            Assert.Equal(0, Count("SELECT COUNT(*) FROM EvaluationRatings WHERE MentorID = @mentorId", new { mentorId }));
        }
        finally
        {
            conn.Execute("DELETE FROM EvaluationRatings WHERE SchoolYear = @TestYear AND Semester = @TestSemester",
                new { TestYear, TestSemester });
            conn.Execute("DELETE FROM Users WHERE UserID IN (@adminId, @mentorId)", new { adminId, mentorId });
        }
    }
}
