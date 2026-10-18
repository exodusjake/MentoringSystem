using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("Departments")]
    public class Department
    {
        [Key]
        public int DepartmentID { get; set; }
        public string DepartmentName { get; set; } = string.Empty;
        public string School { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
    }
}