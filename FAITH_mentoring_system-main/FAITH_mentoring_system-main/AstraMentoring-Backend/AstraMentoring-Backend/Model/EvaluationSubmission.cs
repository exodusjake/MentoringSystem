using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("EvaluationSubmissions")]
    public class EvaluationSubmission
    {
        [Key]
        public int SubmissionID { get; set; }
        public int LinkID { get; set; }
        public int MenteeID { get; set; }
        public DateTime SubmittedAt { get; set; } = DateTime.Now;
        public string? ProofFilePath { get; set; }
    }
}
