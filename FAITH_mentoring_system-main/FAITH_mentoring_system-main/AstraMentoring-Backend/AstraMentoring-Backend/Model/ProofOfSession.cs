using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("ProofOfSession")]
    public class ProofOfSession
    {
        [Key]
        public int ProofID { get; set; }
        public int SessionID { get; set; }
        public int UploadedByUserID { get; set; }
        public string FilePath { get; set; } = string.Empty;
        public string FileType { get; set; } = string.Empty;
        public DateTime UploadedAt { get; set; } = DateTime.Now;
    }
}