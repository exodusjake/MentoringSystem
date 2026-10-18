using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("SystemSettings")]
    public class SystemSetting
    {
        [Key]
        public int SettingID { get; set; }
        public string SettingKey { get; set; } = string.Empty;
        public string SettingValue { get; set; } = string.Empty;
        public DateTime UpdatedAt { get; set; } = DateTime.Now;
    }
}
