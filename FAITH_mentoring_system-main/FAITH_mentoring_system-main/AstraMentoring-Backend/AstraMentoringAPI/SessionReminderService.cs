using AstraMentoring_Backend.Services;
using Dapper;
using Microsoft.Data.SqlClient;

namespace AstraMentoringAPI
{
    // Every minute: any Scheduled session that starts within the next 30 minutes gets one reminder (bell + email)
    // to its mentees. Session times are Philippine time; the server clock is UTC.
    public class SessionReminderService : BackgroundService
    {
        private const int LeadMinutes = 30;
        private static readonly TimeSpan Every = TimeSpan.FromMinutes(1);

        private readonly IServiceScopeFactory _scopes;
        private readonly IConfiguration _config;
        private readonly ILogger<SessionReminderService> _logger;
        private readonly HashSet<int> _done = new();   // sessions already handled since this process started

        public SessionReminderService(IServiceScopeFactory scopes, IConfiguration config, ILogger<SessionReminderService> logger)
        {
            _scopes = scopes;
            _config = config;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);   // let the app finish starting
            while (!stoppingToken.IsCancellationRequested)
            {
                try { await RunOnceAsync(); }
                catch (Exception ex) { _logger.LogWarning(ex, "SessionReminderService: a check failed."); }
                try { await Task.Delay(Every, stoppingToken); } catch (TaskCanceledException) { break; }
            }
        }

        private async Task RunOnceAsync()
        {
            var now = DateTime.UtcNow.AddHours(8);
            var cs = _config.GetConnectionString("DefaultConnection")
                ?? "Server=(localdb)\\MSSQLLocalDB;Database=AstraMentoring;Trusted_Connection=True;MultipleActiveResultSets=True";

            List<(int SessionID, int MentorID, DateTime SessionDate, string? SlotName)> due;
            using (var conn = new SqlConnection(cs))
            {
                due = (await conn.QueryAsync<(int, int, DateTime, string?)>(
                    @"SELECT SessionID, MentorID, SessionDate, SlotName FROM Sessions
                      WHERE Status = 'Scheduled' AND TimeEnd IS NULL AND SessionDate > @Now AND SessionDate <= @Until",
                    new { Now = now, Until = now.AddMinutes(LeadMinutes) })).ToList();
            }

            foreach (var s in due)
            {
                if (!_done.Add(s.SessionID)) continue;
                var minutes = Math.Max(1, (int)Math.Ceiling((s.SessionDate - now).TotalMinutes));
                using var scope = _scopes.CreateScope();
                var email = scope.ServiceProvider.GetRequiredService<EmailService>();
                await email.NotifySessionReminderAsync(s.SessionID, s.MentorID, s.SessionDate, s.SlotName, minutes);
            }

            // Forget sessions that are well in the past so the set stays small.
            if (_done.Count > 5000) _done.Clear();
        }
    }
}
