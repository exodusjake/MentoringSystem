using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("Announcements")]
    public class Announcement
    {
        [Key]
        public int AnnouncementID { get; set; }
        public int PostedByUserID { get; set; }
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public string TargetAudience { get; set; } = string.Empty;
        public DateTime PostedAt { get; set; } = DateTime.Now;
        public bool IsActive  { get; set; } = true;
        public bool IsPinned  { get; set; } = false;
    }
}