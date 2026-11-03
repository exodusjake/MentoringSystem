using AstraMentoring_Backend.Model;
using AstraMentoring_Backend.Repositories;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace AstraMentoring_Backend.Services
{
    public class NotificationsService
    {
        private readonly IGenericRepository<Notification> _repo;
        private readonly string _connectionString;

        public NotificationsService(
            IGenericRepository<Notification> repo,
            IConfiguration config)
        {
            _repo = repo;
            _connectionString = config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";
        }

        public async Task<IEnumerable<Notification>> GetAll() => await _repo.GetAllAsync();
        public async Task<Notification?> GetById(int id) => await _repo.GetByIdAsync(id);
        public async Task<bool> Add(Notification data) => await _repo.AddAsync(data);
        public async Task<bool> Update(Notification data) => await _repo.UpdateAsync(data);
        public async Task<bool> Delete(int id) => await _repo.DeleteAsync(id);

     
        public async Task<IEnumerable<Notification>> GetByRecipientAsync(int userId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.QueryAsync<Notification>(
                "SELECT * FROM Notifications WHERE RecipientUserID = @UserId ORDER BY CreatedAt DESC",
                new { UserId = userId });
        }

        public async Task<bool> MarkAsReadAsync(int notificationId)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE Notifications SET IsRead = 1 WHERE NotificationID = @Id",
                new { Id = notificationId });
            return rows > 0;
        }

      
        // A mentee may answer a mentor's direct message once: flipping the type is the claim, and only one caller can win it.
        // Returns the mentor's user id (the message's ReferenceID), or null if this was not an unanswered direct message of theirs.
        public async Task<int?> ClaimDirectMessageReplyAsync(int notificationId, int userId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteScalarAsync<int?>(
                @"UPDATE Notifications SET Type = 'DirectMessageReplied', IsRead = 1
                  OUTPUT inserted.ReferenceID
                  WHERE NotificationID = @Id AND RecipientUserID = @UserId AND Type = 'DirectMessage' AND ReferenceID IS NOT NULL",
                new { Id = notificationId, UserId = userId });
        }

        // Deletes only if the notification belongs to that user.
        public async Task<bool> DeleteForRecipientAsync(int notificationId, int userId)
        {
            using var conn = new SqlConnection(_connectionString);
            return await conn.ExecuteAsync(
                "DELETE FROM Notifications WHERE NotificationID = @Id AND RecipientUserID = @UserId",
                new { Id = notificationId, UserId = userId }) > 0;
        }

        public async Task DeleteAllForRecipientAsync(int userId)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync("DELETE FROM Notifications WHERE RecipientUserID = @UserId", new { UserId = userId });
        }

        public async Task<bool> MarkAllAsReadAsync(int userId)
        {
            using var conn = new SqlConnection(_connectionString);
            var rows = await conn.ExecuteAsync(
                "UPDATE Notifications SET IsRead = 1 WHERE RecipientUserID = @UserId AND IsRead = 0",
                new { UserId = userId });
            return rows > 0;
        }

        public async Task SendToAllAsync(string type, string message, int? referenceId = null)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                "EXEC sp_SendNotification @Type, @Message, @ReferenceID, @Role, @MentorID",
                new { Type = type, Message = message, ReferenceID = referenceId,
                      Role = (string?)null, MentorID = (int?)null });
        }

        public async Task SendToRoleAsync(string role, string type, string message, int? referenceId = null)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                "EXEC sp_SendNotification @Type, @Message, @ReferenceID, @Role, @MentorID",
                new { Type = type, Message = message, ReferenceID = referenceId,
                      Role = role, MentorID = (int?)null });
        }

        public async Task SendToAssignedMenteesAsync(int mentorUserId, string type, string message, int? referenceId = null)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                "EXEC sp_SendNotification @Type, @Message, @ReferenceID, @Role, @MentorID",
                new { Type = type, Message = message, ReferenceID = referenceId,
                      Role = (string?)null, MentorID = mentorUserId });
        }

        
        public async Task SendToUserAsync(int recipientUserId, string type, string message, int? referenceId = null)
        {
            using var conn = new SqlConnection(_connectionString);
            await conn.ExecuteAsync(
                @"INSERT INTO Notifications (RecipientUserID, Type, Message, ReferenceID, IsRead, CreatedAt)
                  VALUES (@RecipientUserID, @Type, @Message, @ReferenceID, 0, @CreatedAt)",
                new
                {
                    RecipientUserID = recipientUserId,
                    Type = type,
                    Message = message,
                    ReferenceID = referenceId,
                    CreatedAt = DateTime.Now
                });
        }
    }
}