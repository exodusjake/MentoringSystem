using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("SessionRequests")]
    public class SessionRequest
    {
        [Key]
        public int RequestID { get; set; }
        public int MenteeID { get; set; }
        public int AvailabilityID { get; set; }
        public string? Purpose { get; set; }
        public string Status { get; set; } = "Pending";
        public DateTime RequestedAt { get; set; } = DateTime.Now;
        public DateTime? RespondedAt { get; set; }
    }
}