using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("MentorPersonalEvents")]
    public class MentorPersonalEvent
    {
        [Key]
        public int EventID { get; set; }
        public int MentorID { get; set; }
        public string Title { get; set; } = string.Empty;
        public DateTime EventDate { get; set; }
        public DateTime? EndDate { get; set; }
        public string? Notes { get; set; }
        public string Category { get; set; } = "Reminder";
        public DateTime CreatedAt { get; set; } = DateTime.Now;
    }
}
