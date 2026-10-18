using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("MenteeProfiles")]
    public class MenteeProfile
    {
        [Key]
        public int MenteeProfileID { get; set; }
        public int UserID { get; set; }
        public string? Course { get; set; }
        public string? YearLevel { get; set; }  
        public string? Section { get; set; }
        public string? Department { get; set; } 
        public string? School { get; set; }  
        public int? DepartmentID { get; set; }
        public int? SectionID { get; set; }
        public bool IsDropOut { get; set; } = false;
        public string? SignatureFilePath { get; set; }
    }
}