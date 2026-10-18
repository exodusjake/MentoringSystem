using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace AstraMentoring_Backend.Model
{
    [Table("CalendarEvents")]
    public class CalendarEvent
    {
        [Key]
        public int EventID { get; set; }
        public string Title { get; set; } = string.Empty;
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string EventType { get; set; } = "Session Window";
        public string? Description { get; set; }
        public string? Venue { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public bool IsPublished { get; set; } = false;
        // Only two EventType values exist: "Session Schedule" and
        // "Evaluation". A Session Schedule names one of the fixed
        // MentoringSlots (see Constants/MentoringSlots.cs) and captures
        // both its Session Window (StartDate/EndDate) and its Submission
        // Deadline (DeadlineDate) in this one row — the printed Calendar
        // Sheet expands it into the two rows FAITH's rubric expects (see
        // calendar-sheet.js). Evaluation keeps a free-typed Title/date
        // range and never sets SlotName/DeadlineDate.
        public string?   SlotName     { get; set; }
        public string?   SchoolYear   { get; set; }
        public string?   Semester     { get; set; }
        public DateTime? DeadlineDate { get; set; }
    }
}
