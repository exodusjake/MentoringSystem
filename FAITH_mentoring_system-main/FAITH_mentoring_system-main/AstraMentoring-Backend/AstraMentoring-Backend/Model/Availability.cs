using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("Availability")]
    public class Availability
    {
        [Key]
        public int AvailabilityID { get; set; }
        public int MentorID { get; set; }
        public DateTime AvailableDate { get; set; }
        public TimeSpan StartTime { get; set; }
        public TimeSpan? EndTime { get; set; }
        public bool IsBooked { get; set; } = false;
    }
}