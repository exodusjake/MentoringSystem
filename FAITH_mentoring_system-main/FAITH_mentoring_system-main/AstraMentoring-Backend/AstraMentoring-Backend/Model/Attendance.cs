using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("Attendance")]
    public class Attendance
    {
        [Key]
        public int AttendanceID { get; set; }
        public int SessionID { get; set; }
        public int MenteeID { get; set; }
        public DateTime? ScannedAt { get; set; }
        public bool IsPresent { get; set; } = false;
        public string? AbsenceReason { get; set; }
        public string? MentorNotes { get; set; }
        public string? Remarks { get; set; }
    }
}