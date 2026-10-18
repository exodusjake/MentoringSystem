using Microsoft.EntityFrameworkCore;
using AstraMentoring_Backend.Model;

namespace AstraMentoring_Backend.Model
{
    public class AstraDbContext : DbContext
    {
        public AstraDbContext(DbContextOptions<AstraDbContext> options) : base(options) { }

        public DbSet<User> Users { get; set; }
        public DbSet<MentorProfile> MentorProfiles { get; set; }
        public DbSet<MenteeProfile> MenteeProfiles { get; set; }
        public DbSet<MentorMentee> MentorMentees { get; set; }
        public DbSet<Announcement> Announcements { get; set; }
        public DbSet<Availability> Availabilities { get; set; }
        public DbSet<SessionRequest> SessionRequests { get; set; }
        public DbSet<Session> Sessions { get; set; }
        public DbSet<Attendance> Attendances { get; set; }
        public DbSet<ProofOfSession> ProofsOfSession { get; set; }
        public DbSet<EvaluationLink> EvaluationLinks { get; set; }
        public DbSet<Notification> Notifications { get; set; }
        public DbSet<CalendarEvent> CalendarEvents { get; set; }
        public DbSet<AnnouncementAttachment> AnnouncementAttachments { get; set; }
        public DbSet<EvaluationAttachment> EvaluationAttachments { get; set; }
    }
}