using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("Users")]
    public class User
    {
        [Key]
        public int UserID { get; set; }
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string? ProfilePicture { get; set; }
        public string? ContactNumber { get; set; }
        public string? StudentNumber { get; set; }
        public string Role { get; set; } = string.Empty;
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
        public string? SchoolYear { get; set; }
        public string? Semester { get; set; }
        public string? Gender { get; set; }
        public bool HasLoggedIn { get; set; } = false;
        // Admin and Head have no dedicated profile table (unlike Mentor/
        // Mentee's MentorProfiles/MenteeProfiles), so their e-signature
        // lives directly on Users.
        public string? SignatureFilePath { get; set; }
    }
}