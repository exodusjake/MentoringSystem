namespace AstraMentoring_Backend.Constants
{
    // The fixed set of named "Mentoring Requisite Session" checkpoints FAITH's
    // official rubric is built around (Timeliness/Completeness/Evaluation
    // scoring all key off these, per the client-provided calendar sample) —
    // one shared source of truth so Calendar Events (Phase 1), the Mentor's
    // session-slot picker (Phase 2), and the ranking formula (Phase 3) never
    // drift into inconsistent copies of this list.
    public static class MentoringSlots
    {
        public static readonly string[] All =
        {
            "Mentoring Assembly", "Before Prelims", "After Prelims",
            "Before Midterms", "After Midterms", "Before Finals"
        };

        // 2nd Semester drops Mentoring Assembly — every other slot is common
        // to both semesters (confirmed against the client's real calendar).
        public static IEnumerable<string> ForSemester(string? semester) =>
            semester == "2nd Semester" ? All.Skip(1) : All;
    }
}
