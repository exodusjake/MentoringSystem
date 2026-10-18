using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("Sessions")]
    public class Session
    {
        [Key]
        public int SessionID { get; set; }
        public int? RequestID { get; set; }
        public int MentorID { get; set; }
        public string QRCodeToken { get; set; } = Guid.NewGuid().ToString();
        public DateTime SessionDate { get; set; }
        public string Status { get; set; } = "Scheduled";
        public string? Notes { get; set; }
        // Resolved once at write time from the [SECTION] prefix in Notes
        // (see SessionsController.Post/Put) — every "which section is this
        // session for" check reads this instead of re-parsing Notes text.
        public string? SectionCode { get; set; }
        [NotMapped] public string? CourseCode { get; set; }
        [NotMapped] public string? CourseSchool { get; set; }
        public DateTime? TimeEnd { get; set; }
        public string? LogStatus { get; set; }
        public string SchoolYear { get; set; } = string.Empty;
        public string Semester { get; set; } = string.Empty;
        // Which fixed mentoring checkpoint (see Constants/MentoringSlots.cs)
        // this session was logged for — null for sessions logged before this
        // was introduced. Required for a regular (non-makeup) session going
        // forward; replaces the old read-time "Session #N" ordinal.
        public string? SlotName { get; set; }
        // Stamped whenever LogStatus is set to "Submitted" (see
        // SessionsController.PatchLogStatus) — Timeliness scoring compares
        // this against the matching CalendarEvents Deadline for the slot.
        public DateTime? SubmittedAt { get; set; }
    }
}