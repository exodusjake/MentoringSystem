using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("MentorProfiles")]
    public class MentorProfile
    {
        [Key]
        public int MentorProfileID { get; set; }
        public int UserID { get; set; }
        public string? Department { get; set; }  
        public string? School { get; set; } 
        public int? DepartmentID { get; set; } 
        public string? Bio { get; set; }
        public string? Expertise { get; set; }
        public string? SignatureFilePath { get; set; }
    }
}