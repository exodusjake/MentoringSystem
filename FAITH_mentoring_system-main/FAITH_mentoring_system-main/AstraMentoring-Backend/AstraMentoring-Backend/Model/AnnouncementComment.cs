using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("AnnouncementComments")]
    public class AnnouncementComment
    {
        [Key]
        public int CommentID { get; set; }
        public int AnnouncementID { get; set; }
        public int PostedByUserID { get; set; }
        public string Content { get; set; } = string.Empty;
        public DateTime PostedAt { get; set; } = DateTime.Now;
    }
}
