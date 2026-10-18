using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("AnnouncementAttachments")]
    public class AnnouncementAttachment
    {
        [Key]
        public int AttachmentID { get; set; }
        public int AnnouncementID { get; set; }
        public string FileName { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public string FileType { get; set; } = "document";
        public long FileSize { get; set; }
        public DateTime UploadedAt { get; set; } = DateTime.Now;
    }
}
