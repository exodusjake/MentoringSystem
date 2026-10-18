using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("MentorMentee")]
    public class MentorMentee
    {
        [Key]
        public int AssignmentID { get; set; }
        public int MentorID { get; set; }
        public int MenteeID { get; set; }
        public DateTime AssignedDate { get; set; } = DateTime.Now;
        public bool IsActive { get; set; } = true;
    }
}