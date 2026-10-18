using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("EvaluationLinks")]
    public class EvaluationLink
    {
        [Key]
        public int LinkID { get; set; }
        public int PostedByUserID { get; set; }
        [Required]
        public string Title { get; set; } = string.Empty;
        public string? Description { get; set; }
        [Required, Url]
        [RegularExpression(@"(?i)^https?://\S+$", ErrorMessage = "Use an http:// or https:// form link.")]
        public string GoogleFormURL { get; set; } = string.Empty;
        public string TargetRole { get; set; } = string.Empty;
        public DateTime? Deadline { get; set; }
        public DateTime PostedAt { get; set; } = DateTime.Now;
        public bool IsActive { get; set; } = true;
        public bool IsPinned { get; set; } = false;
    }
}
